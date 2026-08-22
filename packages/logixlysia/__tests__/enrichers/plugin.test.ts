import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

import logixlysia from '../../src'
import {
  sizeEnricher,
  traceparentEnricher,
  userAgentEnricher
} from '../../src/enrichers'
import { HttpError, type Options } from '../../src/interfaces'

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const SPAN_ID = '00f067aa0ba902b7'

interface CapturedEvent {
  level: string
  meta: Record<string, unknown>
}

const createCaptureTransport = () => {
  const events: CapturedEvent[] = []
  const transport = mock(
    (level: string, _message: string, meta?: Record<string, unknown>) => {
      events.push({ level, meta: meta ?? {} })
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
    .get('/ok', () => 'ok')
    .get('/custom', ({ log }) => {
      log.info('handled')
      return 'ok'
    })
    .get('/boom', () => {
      throw new HttpError(503, 'downstream')
    })

const contextOf = (event: CapturedEvent | undefined) =>
  event?.meta.context as Record<string, unknown> | undefined

describe('enrichers through the plugin', () => {
  test('request-phase fields reach the access log context', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { enrichers: [traceparentEnricher(), userAgentEnricher()] },
      transport
    )

    await app.handle(
      new Request('http://localhost/ok', {
        headers: {
          traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
          'user-agent': 'curl/8.5.0'
        }
      })
    )

    expect(contextOf(events[0])).toMatchObject({
      trace_id: TRACE_ID,
      ua: { bot: false, device: 'desktop' }
    })
  })

  test('a bare function is treated as the request phase', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { enrichers: [request => ({ tenant: new URL(request.url).host })] },
      transport
    )

    await app.handle(new Request('http://localhost/ok'))

    expect(contextOf(events[0])).toMatchObject({ tenant: 'localhost' })
  })

  test('response-phase fields land on the access log', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      {
        enrichers: [
          sizeEnricher(),
          {
            response: ({ durationMs, status }) => ({
              ok: status < 400,
              slow: durationMs > 10_000
            })
          }
        ]
      },
      transport
    )

    await app.handle(new Request('http://localhost/ok'))

    expect(contextOf(events[0])).toMatchObject({ ok: true, slow: false })
  })

  test('enriched fields also reach custom logs made later in the request', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ enrichers: [traceparentEnricher()] }, transport)

    await app.handle(
      new Request('http://localhost/custom', {
        headers: { traceparent: `00-${TRACE_ID}-${SPAN_ID}-01` }
      })
    )

    expect(contextOf(events[0])).toMatchObject({ trace_id: TRACE_ID })
  })

  test('enrichment runs on the error path too', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      {
        enrichers: [
          traceparentEnricher(),
          { response: ({ status }) => ({ finalStatus: status }) }
        ]
      },
      transport
    )

    await app.handle(
      new Request('http://localhost/boom', {
        headers: { traceparent: `00-${TRACE_ID}-${SPAN_ID}-01` }
      })
    )

    expect(contextOf(events[0])).toMatchObject({
      finalStatus: 503,
      trace_id: TRACE_ID
    })
  })

  test('a throwing enricher is reported and does not break the request', async () => {
    const { events, transport } = createCaptureTransport()
    const onError = mock((_context: { error: unknown; sink: string }) => {
      /* noop */
    })
    const app = buildApp(
      {
        enrichers: [
          () => {
            throw new Error('enricher exploded')
          },
          () => ({ survivor: true })
        ],
        onError
      },
      transport
    )

    const response = await app.handle(new Request('http://localhost/ok'))

    expect(response.status).toBe(200)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0].sink).toBe('enricher')
    expect(contextOf(events[0])).toMatchObject({ survivor: true })
  })

  test('an enricher returning nothing adds no context', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp({ enrichers: [() => undefined] }, transport)

    await app.handle(new Request('http://localhost/ok'))

    expect(contextOf(events[0])).toBeUndefined()
  })
})
