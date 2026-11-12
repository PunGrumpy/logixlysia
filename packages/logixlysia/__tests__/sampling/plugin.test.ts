import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { HttpError } from '../../src/interfaces'
import type { Options, SinkErrorContext } from '../../src/interfaces'
import type { RequestOutcome } from '../../src/sampling'

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
    .get('/logged-503', ({ log, status }) => {
      log.info('calling upstream')
      return status(503, 'down')
    })
    .get('/plan/:plan', ({ log, params }) => {
      log.mergeContext({ plan: params.plan })
      log.info('plan read')
      return 'ok'
    })
    .get('/quiet/:plan', ({ log, params }) => {
      log.mergeContext({ plan: params.plan })
      return 'ok'
    })
    .get('/debug-404', ({ log, status }) => {
      log.debug('looking up the order')
      return status(404, 'no order')
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
    expect(events.map(event => event.message)).toEqual([
      'step one',
      'step two',
      ''
    ])
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

  test('tail sampling rescues the custom logs and the access line of a matching path', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { paths: ['/checkout/**'] } } },
      transport
    )

    await get(app, '/fast')
    expect(events).toHaveLength(0)

    await get(app, '/checkout/cart')
    expect(events.map(event => [event.message, event.meta.status])).toEqual([
      ['cart read', undefined],
      ['', 200]
    ])
  })

  test('a head-dropped custom log does not take the access line with it', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ sampling: { head: { INFO: 0 } } }, transport)

    await get(app, '/logged-503')
    expect(events.map(event => [event.level, event.meta.status])).toEqual([
      ['ERROR', 503]
    ])
  })

  test('a buffered custom log the tail verdict discards leaves the access line', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { DEBUG: 0 }, tail: { status: 500 } } },
      transport
    )

    await get(app, '/debug-404')
    expect(events.map(event => [event.level, event.meta.status])).toEqual([
      ['WARNING', 404]
    ])
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
    expect(events).toHaveLength(3)
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
      close(_ws) {},
      message(_ws, _message) {},
      open(_ws) {}
    })
    const ws = { id: 'ws-1' }

    hooks.open(ws)
    hooks.message(ws, 'hello')
    hooks.close(ws)

    expect(events).toHaveLength(0)
  })
})

describe('tail keep predicate through the plugin', () => {
  test('replays the records of a request whose context the predicate accepts', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      {
        sampling: {
          head: { INFO: 0 },
          tail: { keep: ({ context }) => context.plan === 'enterprise' }
        }
      },
      transport
    )

    await get(app, '/plan/enterprise')
    expect(events.map(event => event.message)).toEqual(['plan read', ''])

    await get(app, '/plan/free')
    expect(events).toHaveLength(2)
  })

  test('hands the predicate the outcome of the finished request', async () => {
    const { transport } = createCaptureTransport()
    const keep = mock((_outcome: RequestOutcome) => false)
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { keep } } },
      transport
    )

    await get(app, '/plan/free')

    const [received] = keep.mock.calls[0] ?? []
    expect(typeof received?.durationMs).toBe('number')
    expect(received?.pathname).toBe('/plan/free')
    expect(received?.status).toBe(200)
    expect(received?.context).toMatchObject({ plan: 'free' })
  })

  test('a predicate that mutates its context does not change later lines', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      {
        sampling: {
          head: { INFO: 0 },
          tail: {
            keep: ({ context }) => {
              ;(context as Record<string, unknown>).plan = 'tampered'
              return true
            }
          }
        }
      },
      transport
    )

    await get(app, '/quiet/free')

    expect(events).toHaveLength(1)
    expect(events[0]?.meta.context).toMatchObject({ plan: 'free' })
  })

  test('a throwing predicate reports through onError and leaves the response alone', async () => {
    const { events, transport } = createCaptureTransport()
    const onError = mock((_context: SinkErrorContext) => {})
    const app = buildApp(
      {
        onError,
        sampling: {
          head: { INFO: 0 },
          tail: {
            keep: () => {
              throw new Error('bad rule')
            }
          }
        }
      },
      transport
    )

    const response = await get(app, '/plan/free')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
    expect(events).toHaveLength(0)
    expect(onError.mock.calls.map(([context]) => context.sink)).toEqual([
      'sampling'
    ])
  })
})

const HEAD_RATE_ERROR = /head\.INFO must be a number between 0 and 100/u
const TAIL_STATUS_ERROR = /tail\.status must be a non-negative number/u
const TAIL_DURATION_ERROR = /tail\.durationMs must be a non-negative number/u
const TAIL_PATHS_ERROR = /tail\.paths must contain non-empty glob strings/u
const TAIL_KEEP_ERROR = /tail\.keep must be a function/u
const MAX_BUFFERED_ERROR =
  /maxBufferedPerRequest must be a non-negative integer/u

const build = (config: NonNullable<Options['config']>) => () =>
  logixlysia({ config })

describe('sampling config validation', () => {
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

  test('rejects a tail keep that is not a function', () => {
    expect(build({ sampling: { tail: { keep: 'x' as never } } })).toThrow(
      TAIL_KEEP_ERROR
    )
  })

  test('rejects a fractional buffer cap', () => {
    expect(build({ sampling: { maxBufferedPerRequest: 1.5 } })).toThrow(
      MAX_BUFFERED_ERROR
    )
  })
})
