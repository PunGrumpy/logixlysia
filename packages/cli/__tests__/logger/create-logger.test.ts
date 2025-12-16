import { describe, expect, mock, test } from 'bun:test'

import type { Options } from '../../src/interfaces'
import { createLogger } from '../../src/logger'

describe('createLogger', () => {
  test('should create a logger with default options', () => {
    const logger = createLogger()
    expect(logger).toBeDefined()
    expect(typeof logger.log).toBe('function')
    expect(typeof logger.handleHttpError).toBe('function')
    expect(logger.pino).toBeDefined() // Should have Pino instance
  })

  test('should create a logger with custom options', () => {
    const options: Options = {
      config: {
        showStartupMessage: false,
        pino: {
          level: 'debug',
          prettyPrint: true
        }
      }
    }
    const logger = createLogger(options)
    expect(logger).toBeDefined()
    expect(logger.pino).toBeDefined()
  })

  test('should handle different log levels', () => {
    const logger = createLogger()

    // Mock the Pino logger methods
    const mockInfo = mock()
    const mockError = mock()
    const mockWarn = mock()

    logger.pino.info = mockInfo
    logger.pino.error = mockError
    logger.pino.warn = mockWarn

    // Test INFO level
    logger.log(
      'INFO',
      new Request('http://localhost'),
      { status: 200 },
      { beforeTime: BigInt(0) }
    )
    expect(mockInfo).toHaveBeenCalled()

    // Test ERROR level
    logger.log(
      'ERROR',
      new Request('http://localhost'),
      { status: 500 },
      { beforeTime: BigInt(0) }
    )
    expect(mockError).toHaveBeenCalled()

    // Test WARN level
    logger.log(
      'WARNING',
      new Request('http://localhost'),
      { status: 400 },
      { beforeTime: BigInt(0) }
    )
    expect(mockWarn).toHaveBeenCalled()
  })

  test('should expose Pino logger instance', () => {
    const logger = createLogger()
    expect(logger.pino).toBeDefined()
    expect(typeof logger.pino.info).toBe('function')
    expect(typeof logger.pino.error).toBe('function')
    expect(typeof logger.pino.warn).toBe('function')
    expect(typeof logger.pino.debug).toBe('function')
  })

  test('should create Pino logger with custom configuration', () => {
    const options: Options = {
      config: {
        pino: {
          level: 'debug',
          messageKey: 'message',
          errorKey: 'error'
        }
      }
    }
    const logger = createLogger(options)
    expect(logger.pino).toBeDefined()
    // Note: We can't easily test the internal configuration of Pino,
    // but we can verify the logger was created successfully
  })
})
