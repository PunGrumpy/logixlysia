import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { HttpError } from '../../src/interfaces'
import type { Options } from '../../src/interfaces'

interface CapturedEvent {
  level: string
  message: string
  meta: Record<string, unknown>
}

type FilterConfig = NonNullable<Options['config']>

const OVER_LIMIT_SEGMENT_LENGTH = 2100

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
  config: FilterConfig,
  transport: ReturnType<typeof createCaptureTransport>['transport'],
  elysiaOptions?: ConstructorParameters<typeof Elysia>[0]
) =>
  new Elysia(elysiaOptions)
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
    .get('/health', () => 'ok')
    .get('/metrics', () => 'ok')
    .get('/api/x', () => 'ok')
    .get('/other', () => 'ok')
    .get('/noted', ({ log }) => {
      log.info('note')
      return 'ok'
    })
    .get('/down', ({ set }) => {
      set.status = 503
      return 'down'
    })
    .get('/boom', () => {
      throw new HttpError(500, 'boom')
    })
    .get('/long/*', () => 'ok')

const get = (app: ReturnType<typeof buildApp>, path: string) =>
  app.handle(new Request(`http://localhost${path}`))

describe('logFilter.accessLine', () => {
  test('exclude hides the access line of a matching path only', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { logFilter: { accessLine: { exclude: ['/health'] } } },
      transport
    )

    await get(app, '/health')
    expect(events).toHaveLength(0)

    await get(app, '/api/x')
    expect(events.map(event => event.level)).toEqual(['INFO'])
  })

  test('a handler line and an enricher field survive an excluded route', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      {
        enrichers: [() => ({ tenant: 'acme' })],
        logFilter: { accessLine: { exclude: ['/noted'] } }
      },
      transport
    )

    await get(app, '/noted')

    expect(events.map(event => event.message)).toEqual(['note'])
    expect(events[0]?.meta.context).toMatchObject({ tenant: 'acme' })
  })

  test('an excluded route that answers 503 still writes its line at ERROR', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { logFilter: { accessLine: { exclude: ['/down'] } } },
      transport
    )

    await get(app, '/down')

    expect(events.map(event => [event.level, event.meta.status])).toEqual([
      ['ERROR', 503]
    ])
  })

  test('an excluded route that throws writes the error line', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { logFilter: { accessLine: { exclude: ['/boom'] } } },
      transport
    )

    await get(app, '/boom')

    expect(events.map(event => event.level)).toEqual(['ERROR'])
  })

  test('include hides other paths but never an unknown path answering 404', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { logFilter: { accessLine: { include: ['/api/**'] } } },
      transport
    )

    await get(app, '/other')
    expect(events).toHaveLength(0)

    await get(app, '/api/x')
    expect(events).toHaveLength(1)

    await get(app, '/missing')
    expect(events.map(event => event.meta.status)).toEqual([200, 404])
  })

  test('exclude beats include for a path both match', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      {
        logFilter: {
          accessLine: { exclude: ['/api/x'], include: ['/api/**'] }
        }
      },
      transport
    )

    await get(app, '/api/x')

    expect(events).toHaveLength(0)
  })

  test('a pathname over the match limit is never hidden', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { logFilter: { accessLine: { include: ['/api/**'] } } },
      transport
    )

    await get(app, `/long/${'a'.repeat(OVER_LIMIT_SEGMENT_LENGTH)}`)

    expect(events.map(event => event.meta.status)).toEqual([200])
  })

  test('empty include and exclude hide nothing', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { logFilter: { accessLine: { exclude: [], include: [] } } },
      transport
    )

    await get(app, '/health')
    await get(app, '/other')

    expect(events).toHaveLength(2)
  })

  test('tail rescue does not bring a hidden access line back', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      {
        logFilter: { accessLine: { exclude: ['/health'] } },
        sampling: { head: { INFO: 0 }, tail: { durationMs: 0 } }
      },
      transport
    )

    await get(app, '/health')

    expect(events).toHaveLength(0)
  })

  test('hides the access line without ahead-of-time compilation too', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { logFilter: { accessLine: { exclude: ['/health'] } } },
      transport,
      { aot: false }
    )

    await get(app, '/health')
    expect(events).toHaveLength(0)

    await get(app, '/api/x')
    expect(events).toHaveLength(1)
  })

  test('rejects a glob the matcher refuses when the plugin is built', () => {
    expect(() =>
      logixlysia({
        config: { logFilter: { accessLine: { exclude: ['**/**'] } } }
      })
    ).toThrow('repeated recursive wildcards')
  })
})
