import { describe, expect, mock, test } from 'bun:test'
import { Elysia, status } from 'elysia'
import { logixlysia } from '../../src'
import { levelForStatus } from '../../src/helpers/status'
import type { Options } from '../../src/interfaces'
import { sleep } from '../_helpers/sleep'

interface CapturedMeta {
  status?: number
}

const createCaptureTransport = () => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {}
  )
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }]
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

interface Handles {
  handle: (request: Request) => Promise<Response>
}

const run = async (app: Handles, path: string): Promise<Response> => {
  const response = await app.handle(new Request(`http://localhost${path}`))
  await response.text().catch(() => '')
  await sleep(30)
  return response
}

const buildApp = (aot: boolean, options: Options) =>
  new Elysia({ aot })
    .use(logixlysia(options))
    .get('/missing', () => status(404, 'nope'))
    .get('/created', () => new Response('made', { status: 201 }))
    .get('/teapot', ({ set }) => {
      set.status = 418
      return 'short'
    })
    .get('/named', ({ set }) => {
      set.status = 'Created'
      return 'ok'
    })
    .get('/broken', () => status(503, 'down'))

const cases = [
  { expectedLevel: 'WARNING', expectedStatus: 404, path: '/missing' },
  { expectedLevel: 'INFO', expectedStatus: 201, path: '/created' },
  { expectedLevel: 'WARNING', expectedStatus: 418, path: '/teapot' },
  { expectedLevel: 'INFO', expectedStatus: 201, path: '/named' },
  { expectedLevel: 'ERROR', expectedStatus: 503, path: '/broken' }
] as const

describe('access line status on the compiled and hook paths', () => {
  for (const aot of [true, false]) {
    for (const { expectedLevel, expectedStatus, path } of cases) {
      test(`logs ${expectedStatus} ${expectedLevel} for ${path} (aot: ${aot})`, async () => {
        const { options, transport } = createCaptureTransport()
        const app = buildApp(aot, options)

        const response = await run(app, path)

        expect(response.status).toBe(expectedStatus)
        expect(transport).toHaveBeenCalledTimes(1)
        const { level, meta } = recordAt(transport, 0)
        expect(meta.status).toBe(response.status)
        expect(level).toBe(expectedLevel)
        expect(level).toBe(levelForStatus(response.status))
      })
    }
  }
})
