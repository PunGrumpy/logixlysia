import { describe, expect, test } from 'bun:test'

import { createLogger } from '../../src/logger'
import { injectTraceContext } from '../../src/otel'

describe('logixlysia/otel', () => {
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
