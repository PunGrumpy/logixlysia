import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

import logixlysia from '../../src'
import type { Options } from '../../src/interfaces'

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

describe('logixlysia plugin - request lifecycle', () => {
  test('logs the status of a returned Response', async () => {
    const { options, transport } = createCaptureTransport()

    const app = new Elysia()
      .use(logixlysia(options))
      .get('/resp', () => new Response('nope', { status: 404 }))

    await app.handle(new Request('http://localhost/resp'))

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(404)
  })

  test('set.status wins over response.status', async () => {
    const { options, transport } = createCaptureTransport()

    const app = new Elysia()
      .use(logixlysia(options))
      .get('/both', ({ set }) => {
        set.status = 201
        return new Response('x', { status: 200 })
      })

    await app.handle(new Request('http://localhost/both'))

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).meta.status).toBe(201)
  })

  test('a filtered-out debug log does not suppress the access log', async () => {
    const { options, transport } = createCaptureTransport({
      logFilter: { level: ['INFO'] }
    })

    const app = new Elysia()
      .use(logixlysia(options))
      .get('/test', ({ log }) => {
        log.debug('invisible')
        return 'ok'
      })

    await app.handle(new Request('http://localhost/test'))

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(200)
  })
})
