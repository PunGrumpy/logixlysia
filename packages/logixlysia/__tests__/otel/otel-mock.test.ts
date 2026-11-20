import { afterEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { resetOtelApi } from '../../src/helpers/otel-api'
import { createLogger } from '../../src/logger'
import { injectTraceContext, otelEnricher } from '../../src/otel'

const fakeSpanContext = {
  spanId: '0123456789abcdef',
  traceFlags: 1,
  traceId: 'abc123def456789012345678abcdef01'
}

interface FakeSpan {
  spanContext: () => {
    spanId: string
    traceFlags?: unknown
    traceId: string
  }
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
      trace_flags: '01',
      trace_id: fakeSpanContext.traceId,
      trace_sampled: true
    })
    expect(logger.getContext(request)).toMatchObject({
      span_id: fakeSpanContext.spanId,
      trace_flags: '01',
      trace_id: fakeSpanContext.traceId,
      trace_sampled: true
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
      trace_flags: '01',
      trace_id: fakeSpanContext.traceId,
      trace_sampled: true
    })
  })

  test('an unsampled span reports trace_flags 00 and trace_sampled false', () => {
    resetOtelApi()
    getSpanMock.mockImplementation(() => ({
      spanContext: () => ({ ...fakeSpanContext, traceFlags: 0 })
    }))

    const fields = otelEnricher().request?.(new Request('http://localhost/'))

    expect(fields).toEqual({
      span_id: fakeSpanContext.spanId,
      trace_flags: '00',
      trace_id: fakeSpanContext.traceId,
      trace_sampled: false
    })
  })

  test('leaves the flags out when the span context has none it can read', () => {
    const idsOnly = {
      span_id: fakeSpanContext.spanId,
      trace_id: fakeSpanContext.traceId
    }
    const unreadable: unknown[] = [undefined, 256, -1, 1.5, '01', null]

    for (const traceFlags of unreadable) {
      resetOtelApi()
      getSpanMock.mockImplementation(() => ({
        spanContext: () => ({ ...fakeSpanContext, traceFlags })
      }))

      expect(
        otelEnricher().request?.(new Request('http://localhost/'))
      ).toEqual(idsOnly)
    }
  })

  test('writes the whole flags byte as two hex digits', () => {
    resetOtelApi()
    getSpanMock.mockImplementation(() => ({
      spanContext: () => ({ ...fakeSpanContext, traceFlags: 0xaa })
    }))

    expect(
      otelEnricher().request?.(new Request('http://localhost/'))
    ).toMatchObject({ trace_flags: 'aa', trace_sampled: false })
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
      trace_flags: '01',
      trace_id: fakeSpanContext.traceId,
      trace_sampled: true
    })
  })
})
