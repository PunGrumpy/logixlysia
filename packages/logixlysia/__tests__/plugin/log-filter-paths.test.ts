import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia, useLogger } from '../../src'
import { HttpError } from '../../src/interfaces'
import type { Options } from '../../src/interfaces'
import { labelRequest } from '../../src/utils/synthetic-request'

interface CapturedEvent {
  level: string
  message: string
  meta: Record<string, unknown>
}

type Config = NonNullable<Options['config']>

const OVER_LIMIT_SEGMENT_LENGTH = 2100

let messageReads = 0

const readCountingError = (): Error => {
  const error = new Error('x')
  Object.defineProperty(error, 'message', {
    get() {
      messageReads += 1
      return 'x'
    }
  })
  return error
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
  config: Config,
  transport: ReturnType<typeof createCaptureTransport>['transport'],
  extra: Pick<Options, 'preset'> = {}
) =>
  new Elysia()
    .use(
      logixlysia({
        ...extra,
        config: {
          ...config,
          disableFileLogging: true,
          disableInternalLogger: true,
          showStartupMessage: false,
          transports: [{ log: transport }]
        }
      })
    )
    .get('/health', () => 'ok')
    .get('/api/users', () => 'ok')
    .get('/api/users/:id', () => 'ok')
    .get('/api/noted', ({ log }) => {
      log.info('handler note')
      return 'ok'
    })
    .get('/health/noted', ({ log }) => {
      log.info('handler note')
      return 'ok'
    })
    .get('/health/boom', () => {
      throw new HttpError(500, 'boom')
    })
    .get('/api/boom', () => {
      throw new HttpError(500, 'boom')
    })
    .get('/other', () => 'ok')
    .get('/api/long/*', () => 'ok')
    .all('/health/any', () => 'ok')
    .get('/health/errors', ({ log }) => {
      log.error(readCountingError())
      return 'ok'
    })
    .get('/api/errors', ({ log }) => {
      log.error(readCountingError())
      return 'ok'
    })

const get = (app: ReturnType<typeof buildApp>, path: string) =>
  app.handle(new Request(`http://localhost${path}`))

const paths = (events: CapturedEvent[]): string[] =>
  events.map(event => {
    const request = event.meta.request as { url?: string } | undefined
    return new URL(request?.url ?? 'http://none').pathname
  })

describe('logFilter include / exclude', () => {
  test('exclude silences a matching path and logs the rest', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { exclude: ['/health'] } }, transport)

    await get(app, '/health')
    await get(app, '/other')

    expect(paths(events)).toEqual(['/other'])
  })

  test('include logs only matching paths', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { include: ['/api/**'] } }, transport)

    await get(app, '/health')
    await get(app, '/other')
    await get(app, '/api/users')

    expect(paths(events)).toEqual(['/api/users'])
  })

  test('exclude beats include for a path both match', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { logFilter: { exclude: ['/api/users'], include: ['/api/**'] } },
      transport
    )

    await get(app, '/api/users')
    await get(app, '/api/users/7')

    expect(paths(events)).toEqual(['/api/users/7'])
  })

  test('** crosses a slash and * does not', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { exclude: ['/api/*'] } }, transport)

    await get(app, '/api/users')
    await get(app, '/api/users/7')
    expect(paths(events)).toEqual(['/api/users/7'])

    const recursive = createCaptureTransport()
    const deep = buildApp(
      { logFilter: { exclude: ['/api/**'] } },
      recursive.transport
    )
    await get(deep, '/api/users')
    await get(deep, '/api/users/7')
    await get(deep, '/other')
    expect(paths(recursive.events)).toEqual(['/other'])
  })

  test('the query string does not take part in the match', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { exclude: ['/health'] } }, transport)

    await get(app, '/health?probe=/api/users')
    await get(app, '/other?x=/health')

    expect(paths(events)).toEqual(['/other'])
  })

  test('an empty include or exclude puts no limit on paths', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { exclude: [], include: [] } }, transport)

    await get(app, '/health')
    await get(app, '/other')

    expect(paths(events)).toEqual(['/health', '/other'])
  })

  test('log calls made by an excluded handler write nothing', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { exclude: ['/health/**'] } }, transport)

    await get(app, '/health/noted')
    expect(events).toHaveLength(0)

    await get(app, '/api/noted')
    expect(events.map(event => event.message)).toEqual(['handler note', ''])
  })

  test('useLogger() calls made inside an excluded handler write nothing', async () => {
    const { events, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            logFilter: { exclude: ['/ambient'] },
            showStartupMessage: false,
            transports: [{ log: transport }],
            useAsyncLocalStorage: true
          }
        })
      )
      .get('/ambient', () => {
        useLogger().info('ambient note')
        return 'ok'
      })
      .get('/kept', () => {
        useLogger().info('ambient note')
        return 'ok'
      })

    await app.handle(new Request('http://localhost/ambient'))
    expect(events).toHaveLength(0)

    await app.handle(new Request('http://localhost/kept'))
    expect(events.map(event => event.message)).toEqual(['ambient note', ''])
  })

  test('an error thrown on an excluded path writes no error line', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { exclude: ['/health/**'] } }, transport)

    const response = await get(app, '/health/boom')
    expect(response.status).toBe(500)
    expect(events).toHaveLength(0)

    await get(app, '/api/boom')
    expect(events.map(event => event.level)).toEqual(['ERROR'])
  })

  test('a path outside include writes no error line either', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { include: ['/api/**'] } }, transport)

    await get(app, '/health/boom')
    await get(app, '/does-not-exist')

    expect(events).toHaveLength(0)
  })

  test('works with a preset and combines with the level filter', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { logFilter: { exclude: ['/health'], level: ['ERROR'] } },
      transport,
      { preset: 'prod' }
    )

    await get(app, '/health')
    await get(app, '/other')
    await get(app, '/api/boom')
    await get(app, '/health/boom')

    expect(paths(events)).toEqual(['/api/boom', '/health/boom'])
  })

  test('an excluded request skips enrichers but still echoes the request id', async () => {
    const { events, transport } = createCaptureTransport()
    const enricher = mock(() => ({ tenant: 'acme' }))
    const app = buildApp(
      {
        enrichers: [enricher],
        logFilter: { exclude: ['/health'] },
        requestId: true
      },
      transport
    )

    const excluded = await get(app, '/health')
    expect(enricher).not.toHaveBeenCalled()
    expect(excluded.headers.get('x-request-id')).toBeTruthy()
    expect(events).toHaveLength(0)

    await get(app, '/other')
    expect(enricher).toHaveBeenCalledTimes(1)
    expect(events[0]?.meta.context).toMatchObject({ tenant: 'acme' })
  })

  test('runJob lines are not subject to path globs', async () => {
    const { events, transport } = createCaptureTransport()
    const plugin = logixlysia({
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        logFilter: { include: ['/api/**'] },
        showStartupMessage: false,
        transports: [{ log: transport }]
      }
    })

    await plugin.runJob('nightly', log => {
      log.info('syncing')
    })

    expect(events.map(event => event.message)).toEqual(['syncing', ''])
  })

  test('a client request whose method reads JOB is still filtered', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { exclude: ['/health/**'] } }, transport)

    await app.handle(
      labelRequest(new Request('http://localhost/health/any'), 'JOB')
    )

    expect(events).toHaveLength(0)
  })

  test('log.error does not read the error on an excluded request', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { exclude: ['/health/**'] } }, transport)
    messageReads = 0

    await get(app, '/health/errors')
    expect(messageReads).toBe(0)
    expect(events).toHaveLength(0)

    await get(app, '/api/errors')
    expect(messageReads).toBeGreaterThan(0)
    expect(events.map(event => event.level)).toEqual(['ERROR', 'INFO'])
  })

  test('a path too long to match is logged even with include set', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ logFilter: { include: ['/api/users'] } }, transport)

    await get(app, `/api/long/${'a'.repeat(OVER_LIMIT_SEGMENT_LENGTH)}`)

    expect(events).toHaveLength(1)
  })

  test('a filter object edited between plugins is read afresh by each', async () => {
    const logFilter = { exclude: ['/health'] }
    const first = createCaptureTransport()
    const second = createCaptureTransport()
    const one = buildApp({ logFilter }, first.transport)
    logFilter.exclude = ['/other']
    const two = buildApp({ logFilter }, second.transport)

    await get(one, '/health')
    await get(one, '/other')
    await get(two, '/health')
    await get(two, '/other')

    expect(paths(first.events)).toEqual(['/other'])
    expect(paths(second.events)).toEqual(['/health'])
  })
})
