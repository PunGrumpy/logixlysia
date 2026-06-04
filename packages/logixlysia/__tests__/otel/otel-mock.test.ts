import { afterEach, describe, expect, mock, test } from 'bun:test'

import { createLogger } from '../../src/logger'
import { __resetForTesting, injectTraceContext } from '../../src/otel'

const fakeSpanContext = {
  traceId: 'abc123def456789012345678abcdef01',
  spanId: '0123456789abcdef'
}

const getSpanMock = mock(() => ({
  spanContext: () => fakeSpanContext
}))

// Mock @opentelemetry/api so that createRequire('...')('@opentelemetry/api')
// resolves to our fake API.
mock.module('@opentelemetry/api', () => ({
  context: { active: () => ({}) },
  trace: { getSpan: getSpanMock }
}))

describe('logixlysia/otel (mocked)', () => {
  afterEach(() => {
    // Reset the module-level cache so each test starts fresh
    __resetForTesting()
    getSpanMock.mockImplementation(() => ({
      spanContext: () => fakeSpanContext
    }))
  })

  test('injects trace_id & span_id when OTel API returns an active span', () => {
    // Reset cache so it re-resolves from the mock
    __resetForTesting()

    const logger = createLogger({
      config: {
        disableInternalLogger: true,
        disableFileLogging: true
      }
    })
    const request = new Request('http://localhost/')

    const result = injectTraceContext(logger, request)

    expect(result).toEqual({
      trace_id: fakeSpanContext.traceId,
      span_id: fakeSpanContext.spanId
    })
    expect(logger.getContext(request)).toMatchObject({
      trace_id: fakeSpanContext.traceId,
      span_id: fakeSpanContext.spanId
    })
  })

  test('returns undefined when getSpan returns no active span', () => {
    __resetForTesting()
    getSpanMock.mockImplementation(() => undefined as any)

    const logger = createLogger({
      config: {
        disableInternalLogger: true,
        disableFileLogging: true
      }
    })
    const request = new Request('http://localhost/')

    const result = injectTraceContext(logger, request)

    expect(result).toBeUndefined()
    expect(logger.getContext(request)).toEqual({})
  })
})
