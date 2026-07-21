import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { createLogger } from '../../src/logger'
import { __resetForTesting, injectTraceContext } from '../../src/otel'

// mock.module registrations from other test files (otel-mock.test.ts) persist
// for the whole process, so simulate an unresolvable module explicitly instead
// of relying on test-file execution order.
mock.module('@opentelemetry/api', () => {
  throw new Error('module not installed')
})

describe('logixlysia/otel', () => {
  beforeEach(() => {
    __resetForTesting()
  })

  test('injectTraceContext is a no-op when OpenTelemetry is not installed', () => {
    const logger = createLogger({
      config: {
        disableInternalLogger: true,
        disableFileLogging: true
      }
    })
    const request = new Request('http://localhost/')

    expect(injectTraceContext(logger, request)).toBeUndefined()
    expect(logger.getContext(request)).toEqual({})
  })
})
