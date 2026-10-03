import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { Options } from '../../src/interfaces'
import { sleep } from '../_helpers/sleep'

interface CapturedMeta {
  context?: Record<string, unknown>
  durationMs: number
  status?: number
}

const createCaptureTransport = (config: Options['config'] = {}) => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {
      /* noop */
    }
  )
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }],
      ...config
    }
  }
  return { options, transport }
}

const recordAt = (
  transport: ReturnType<typeof createCaptureTransport>['transport'],
  index: number
): { level: unknown; meta: CapturedMeta } => {
  const call = transport.mock.calls[index]
  if (!call) {
    throw new Error(`no transport call recorded at index ${index}`)
  }
  return { level: call[0], meta: call[2] as CapturedMeta }
}

// Elysia runs onAfterResponse hooks in a setImmediate after handle() resolves.
const run = async (
  app: { handle: (request: Request) => Promise<Response> },
  path: string
): Promise<Response> => {
  const response = await app.handle(new Request(`http://localhost${path}`))
  await sleep(10)
  return response
}

describe('logixlysia plugin - status resolution', () => {
  test('logs a returned status() 404 as a warning', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/nope', ({ status }) => status(404, 'nope'))

    const response = await run(app, '/nope')

    expect(response.status).toBe(404)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(404)
  })

  test('logs a returned status() 201 as info', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/created', ({ status }) => status(201, 'created'))

    await run(app, '/created')

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(201)
  })

  test('logs a returned status() 500 as an error', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/bad', ({ status }) => status(500, 'bad'))

    await run(app, '/bad')

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('ERROR')
    expect(meta.status).toBe(500)
  })

  test('logs a status() returned from beforeHandle', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/guarded', () => 'ok', {
        beforeHandle: ({ status }) => status(403, 'forbidden')
      })

    const response = await run(app, '/guarded')

    expect(response.status).toBe(403)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(403)
  })

  test('logs a thrown status() with its string body as the message', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/conflict', ({ status }) => {
        throw status(409, 'conflict')
      })

    const response = await run(app, '/conflict')

    expect(response.status).toBe(409)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(409)
    expect(transport.mock.calls[0]?.[1]).toBe('conflict')
  })

  test('logs the status text instead of an object body', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/unauthorized', ({ status }) => {
        throw status(401, { error: 'unauthorized' })
      })

    await run(app, '/unauthorized')

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(401)
    expect(transport.mock.calls[0]?.[1]).toBe('Unauthorized')
  })

  test('tail sampling keeps a status() 404 that head sampling drops', async () => {
    const { options, transport } = createCaptureTransport({
      sampling: { head: { INFO: 0, WARNING: 0 }, tail: { status: 400 } }
    })
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/nope', ({ status }) => status(404, 'nope'))

    await run(app, '/nope')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).meta.status).toBe(404)
  })
})
