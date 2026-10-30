import { afterEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { resetOtelApi } from '../../src/helpers/otel-api'
import { createLogger } from '../../src/logger'
import { injectTraceContext, otelEnricher } from '../../src/otel'

const fakeSpanContext = {
  spanId: '0123456789abcdef',
  traceId: 'abc123def456789012345678abcdef01'
}

interface FakeSpan {
  spanContext: () => typeof fakeSpanContext
}

const getSpanMock = mock((): FakeSpan | undefined => ({
  spanContext: () => fakeSpanContext
}))

mock.module('@opentelemetry/api', () => ({
  context: { active: () => ({}) },
  trace: { getSpan: getSpanMock }
}))

describe('logixlysia/otel (mocked)', () => {
  afterEach(() => {
    resetOtelApi()
    getSpanMock.mockImplementation(() => ({
      spanContext: () => fakeSpanContext
    }))
  })

  test('injects trace_id & span_id when OTel API returns an active span', () => {
    resetOtelApi()

    const logger = createLogger({
      config: {
        disableFileLogging: true,
        disableInternalLogger: true
      }
    })
    const request = new Request('http://localhost/')

    const result = injectTraceContext(logger, request)

    expect(result).toEqual({
      span_id: fakeSpanContext.spanId,
      trace_id: fakeSpanContext.traceId
    })
    expect(logger.getContext(request)).toMatchObject({
      span_id: fakeSpanContext.spanId,
      trace_id: fakeSpanContext.traceId
    })
  })

  test('returns undefined when getSpan returns no active span', () => {
    resetOtelApi()
    getSpanMock.mockImplementation(() => {})

    const logger = createLogger({
      config: {
        disableFileLogging: true,
        disableInternalLogger: true
      }
    })
    const request = new Request('http://localhost/')

    const result = injectTraceContext(logger, request)

    expect(result).toBeUndefined()
    expect(logger.getContext(request)).toEqual({})
  })

  test('otelEnricher returns the active span ids', () => {
    resetOtelApi()

    const fields = otelEnricher().request?.(new Request('http://localhost/'))

    expect(fields).toEqual({
      span_id: fakeSpanContext.spanId,
      trace_id: fakeSpanContext.traceId
    })
  })

  test('otelEnricher puts the span ids on the access log context', async () => {
    resetOtelApi()
    const events: Record<string, unknown>[] = []
    const capture = mock(
      (_level: string, _message: string, meta?: Record<string, unknown>) => {
        events.push(meta ?? {})
      }
    )
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            enrichers: [otelEnricher()],
            transports: [{ log: capture }]
          }
        })
      )
      .get('/ok', () => 'ok')

    await app.handle(new Request('http://localhost/ok'))

    expect(events[0]?.context).toMatchObject({
      span_id: fakeSpanContext.spanId,
      trace_id: fakeSpanContext.traceId
    })
  })
})
