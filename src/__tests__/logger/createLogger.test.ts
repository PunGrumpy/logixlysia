import { describe, expect, mock, test } from 'bun:test'

import { Options } from '../../interfaces'
import { createLogger } from '../../logger'

describe('createLogger', () => {
  test('should create a logger with default options', () => {
    const logger = createLogger()
    expect(logger).toBeDefined()
    expect(typeof logger.log).toBe('function')
    expect(typeof logger.handleHttpError).toBe('function')
  })

  test('should create a logger with custom options', () => {
    const options: Options = {
      config: {
        showStartupMessage: false
      }
    }
    const logger = createLogger(options)
    expect(logger).toBeDefined()
  })

  test('should handle different log levels', () => {
    const logger = createLogger()
    const consoleLog = mock(() => {})
    const originalConsoleLog = console.log
    console.log = consoleLog

    logger.log(
      'INFO',
      new Request('http://localhost'),
      { status: 200 },
      { beforeTime: BigInt(0) }
    )
    expect(consoleLog).toHaveBeenCalled()

    console.log = originalConsoleLog
  })
})
