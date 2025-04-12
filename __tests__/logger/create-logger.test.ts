import { describe, expect, mock, test } from 'bun:test'

import type { Options } from '../../src/interfaces'
import { createLogger } from '../../src/logger'

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
    const consoleLog = mock(() => {
      return
    })
    const originalConsoleLog = console.log
    console.log = consoleLog

    // Test INFO level
    logger.log(
      'INFO',
      new Request('http://localhost'),
      { status: 200 },
      { beforeTime: BigInt(0) }
    )
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('INFO'))

    // Reset mock to test ERROR level
    consoleLog.mockReset()
    logger.log(
      'ERROR',
      new Request('http://localhost'),
      { status: 500 },
      { beforeTime: BigInt(0) }
    )
    expect(consoleLog).toHaveBeenCalled()
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('ERROR'))

    // Reset mock to test WARN level
    consoleLog.mockReset()
    logger.log(
      'WARN',
      new Request('http://localhost'),
      { status: 400 },
      { beforeTime: BigInt(0) }
    )
    expect(consoleLog).toHaveBeenCalled()
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('WARN'))
    console.log = originalConsoleLog
  })
})
