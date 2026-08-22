import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

import logixlysia from '../../src'
import { HttpError, type Options } from '../../src/interfaces'

interface CapturedEvent {
  level: string
  message: string
  meta: Record<string, unknown>
}

const createCaptureTransport = () => {
  const events: CapturedEvent[] = []
  const transport = mock(
    (level: string, message: string, meta?: Record<string, unknown>) => {
      events.push({ level, message, meta: meta ?? {} })
    }
  )
  return { events, transport }
}

const buildApp = (
  config: NonNullable<Options['config']>,
  transport: ReturnType<typeof createCaptureTransport>['transport']
) =>
  new Elysia()
    .use(
      logixlysia({
        config: {
          ...config,
          disableFileLogging: true,
          disableInternalLogger: true,
          transports: [{ log: transport }]
        }
      })
    )
    .get('/fast', ({ log }) => {
      log.info('step one')
      log.info('step two')
      return 'ok'
    })
    .get('/boom', () => {
      throw new HttpError(503, 'downstream')
    })
    .get('/boom-logged', ({ log }) => {
      log.info('loaded the order')
      throw new HttpError(503, 'downstream')
    })
    .get('/checkout/cart', ({ log }) => {
      log.info('cart read')
      return 'ok'
    })

const get = (app: ReturnType<typeof buildApp>, path: string) =>
  app.handle(new Request(`http://localhost${path}`))

describe('sampling through the plugin', () => {
  test('head sampling at 0% silences INFO but keeps ERROR', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ sampling: { head: { INFO: 0 } } }, transport)

    await get(app, '/fast')
    expect(events).toHaveLength(0)

    await get(app, '/boom')
    expect(events.map(event => event.level)).toEqual(['ERROR'])
  })

  test('head sampling at 100% is a no-op', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ sampling: { head: { INFO: 100 } } }, transport)

    await get(app, '/fast')
    expect(events).toHaveLength(2)
  })

  test('tail sampling replays head-dropped records on an error status', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { status: 400 } } },
      transport
    )

    await get(app, '/fast')
    expect(events).toHaveLength(0)

    await get(app, '/boom-logged')
    expect(events.map(event => [event.level, event.message])).toEqual([
      ['INFO', 'loaded the order'],
      ['ERROR', 'downstream']
    ])
  })

  test('tail sampling rescues the custom logs of a matching path', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { paths: ['/checkout/**'] } } },
      transport
    )

    await get(app, '/fast')
    expect(events).toHaveLength(0)

    await get(app, '/checkout/cart')
    expect(events.map(event => event.message)).toEqual(['cart read'])
  })

  test('a replayed record keeps the duration it had when captured', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { paths: ['/checkout/**'] } } },
      transport
    )

    await get(app, '/checkout/cart')

    const [replayed] = events
    expect(typeof replayed?.meta.durationMs).toBe('number')
  })

  test('sampling is off entirely when unconfigured', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({}, transport)

    await get(app, '/fast')
    expect(events).toHaveLength(2)
  })

  test('WebSocket pseudo-requests drop rather than buffer', () => {
    const { events, transport } = createCaptureTransport()
    const plugin = logixlysia({
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        sampling: { head: { INFO: 0 }, tail: { status: 400 } },
        transports: [{ log: transport }]
      }
    })
    const hooks = plugin.wrapWs('/ws', {
      close(_ws) {
        /* noop */
      },
      message(_ws, _message) {
        /* noop */
      },
      open(_ws) {
        /* noop */
      }
    })
    const ws = { id: 'ws-1' }

    hooks.open(ws)
    hooks.message(ws, 'hello')
    hooks.close(ws)

    expect(events).toHaveLength(0)
  })
})

const HEAD_RATE_ERROR = /head\.INFO must be a number between 0 and 100/
const TAIL_STATUS_ERROR = /tail\.status must be a non-negative number/
const TAIL_DURATION_ERROR = /tail\.durationMs must be a non-negative number/
const TAIL_PATHS_ERROR = /tail\.paths must contain non-empty glob strings/
const MAX_BUFFERED_ERROR =
  /maxBufferedPerRequest must be a non-negative integer/

describe('sampling config validation', () => {
  const build = (config: NonNullable<Options['config']>) => () =>
    logixlysia({ config })

  test('rejects a rate outside 0-100', () => {
    expect(build({ sampling: { head: { INFO: 150 } } })).toThrow(
      HEAD_RATE_ERROR
    )
  })

  test('rejects a negative tail status', () => {
    expect(build({ sampling: { tail: { status: -1 } } })).toThrow(
      TAIL_STATUS_ERROR
    )
  })

  test('rejects a negative tail duration', () => {
    expect(build({ sampling: { tail: { durationMs: -5 } } })).toThrow(
      TAIL_DURATION_ERROR
    )
  })

  test('rejects an empty glob', () => {
    expect(build({ sampling: { tail: { paths: [''] } } })).toThrow(
      TAIL_PATHS_ERROR
    )
  })

  test('rejects a fractional buffer cap', () => {
    expect(build({ sampling: { maxBufferedPerRequest: 1.5 } })).toThrow(
      MAX_BUFFERED_ERROR
    )
  })
})
