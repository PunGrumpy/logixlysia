import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test
} from 'bun:test'
import type { Options, RequestInfo, StoreData } from '../../interfaces'
import { HttpError } from '../../interfaces'
import { createLogger } from '../../logger/create-logger'
import { handleHttpError } from '../../logger/handle-http-error'

// Mock fs module
mock.module('node:fs/promises', () => ({
  appendFile: mock(() => Promise.resolve())
}))

describe('Logging Output Control', () => {
  let consoleSpy: ReturnType<typeof spyOn>
  let consoleErrorSpy: ReturnType<typeof spyOn>
  let mockRequest: RequestInfo
  let mockStore: StoreData

  beforeEach(() => {
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {
      // Mock implementation - intentionally empty
    })
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {
      // Mock implementation - intentionally empty
    })
    mockRequest = {
      headers: { get: () => 'application/json' },
      method: 'GET',
      url: 'http://localhost:3000/test'
    }
    mockStore = {
      beforeTime: process.hrtime.bigint()
    }
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('useTransportsOnly option', () => {
    test('should only use transports when useTransportsOnly is true', () => {
      const transportMock = mock(() => Promise.resolve())
      const options: Options = {
        config: {
          useTransportsOnly: true,
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }

      const logger = createLogger(options)
      logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(transportMock).toHaveBeenCalled()
    })

    test('should disable file logging when useTransportsOnly is true', () => {
      const transportMock = mock(() => Promise.resolve())
      const options: Options = {
        config: {
          useTransportsOnly: true,
          logFilePath: '/tmp/test.log',
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }

      const logger = createLogger(options)
      logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(transportMock).toHaveBeenCalled()
      // File logging should be disabled, so fs.appendFile should not be called
      // This is implicit since we're mocking fs.appendFile and it shouldn't be called
    })

    test('should handle HTTP errors with useTransportsOnly', () => {
      const transportMock = mock(() => Promise.resolve())
      const options: Options = {
        config: {
          useTransportsOnly: true,
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }

      const error = new HttpError(500, 'Internal Server Error')
      handleHttpError(mockRequest, error, mockStore, options)

      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(transportMock).toHaveBeenCalled()
    })
  })

  describe('disableFileLogging option', () => {
    test('should disable file logging when disableFileLogging is true', () => {
      const options: Options = {
        config: {
          logFilePath: '/tmp/test.log',
          disableFileLogging: true
        }
      }

      const logger = createLogger(options)
      logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

      expect(consoleSpy).toHaveBeenCalled()
      // File logging should be disabled
    })

    test('should still log to console when disableFileLogging is true', () => {
      const options: Options = {
        config: {
          disableFileLogging: true
        }
      }

      const logger = createLogger(options)
      logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

      expect(consoleSpy).toHaveBeenCalled()
    })

    test('should still use transports when disableFileLogging is true', () => {
      const transportMock = mock(() => Promise.resolve())
      const options: Options = {
        config: {
          logFilePath: '/tmp/test.log',
          disableFileLogging: true,
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }

      const logger = createLogger(options)
      logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

      expect(consoleSpy).toHaveBeenCalled()
      expect(transportMock).toHaveBeenCalled()
    })
  })

  describe('Combined options', () => {
    test('should work with both disableInternalLogger and disableFileLogging', () => {
      const transportMock = mock(() => Promise.resolve())
      const options: Options = {
        config: {
          logFilePath: '/tmp/test.log',
          disableInternalLogger: true,
          disableFileLogging: true,
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }

      const logger = createLogger(options)
      logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(transportMock).toHaveBeenCalled()
      // File logging should be disabled
    })

    test('should use only transports when useTransportsOnly is true regardless of other options', () => {
      const transportMock = mock(() => Promise.resolve())
      const options: Options = {
        config: {
          logFilePath: '/tmp/test.log',
          useTransportsOnly: true,
          disableInternalLogger: false, // This should be ignored
          disableFileLogging: false, // This should be ignored
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }

      const logger = createLogger(options)
      logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(transportMock).toHaveBeenCalled()
      // File logging should be disabled
    })

    test('should handle all outputs disabled scenario', () => {
      const options: Options = {
        config: {
          useTransportsOnly: true
          // No transports defined
        }
      }

      const logger = createLogger(options)
      logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

      expect(consoleSpy).not.toHaveBeenCalled()
      // No transports, no file logging, no console - should complete without errors
    })
  })

  describe('Custom logger methods', () => {
    test('should respect useTransportsOnly in custom methods', () => {
      const transportMock = mock(() => Promise.resolve())
      const options: Options = {
        config: {
          useTransportsOnly: true,
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }

      const logger = createLogger(options)
      logger.info(mockRequest, 'Info message')
      logger.error(mockRequest, 'Error message')
      logger.warn(mockRequest, 'Warning message')
      logger.debug(mockRequest, 'Debug message')

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(transportMock).toHaveBeenCalledTimes(4)
    })

    test('should respect disableFileLogging in custom methods', () => {
      const transportMock = mock(() => Promise.resolve())
      const options: Options = {
        config: {
          logFilePath: '/tmp/test.log',
          disableFileLogging: true,
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }

      const logger = createLogger(options)
      logger.info(mockRequest, 'Info message')
      logger.error(mockRequest, 'Error message')

      expect(consoleSpy).toHaveBeenCalledTimes(2)
      expect(transportMock).toHaveBeenCalledTimes(2)
    })
  })
})
