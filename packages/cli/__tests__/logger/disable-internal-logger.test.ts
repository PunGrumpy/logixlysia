import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test
} from 'bun:test'
import type {
  HttpError,
  Options,
  RequestInfo,
  StoreData
} from '../../src/interfaces'
import { createLogger } from '../../src/logger/create-logger'

describe('disableInternalLogger', () => {
  let consoleSpy: ReturnType<typeof spyOn>
  let mockRequest: RequestInfo
  let mockStore: StoreData

  beforeEach(() => {
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {
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
  })

  test('should log to console when disableInternalLogger is false', () => {
    const options: Options = {
      config: {
        disableInternalLogger: false
      }
    }

    const logger = createLogger(options)
    logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

    expect(consoleSpy).toHaveBeenCalled()
  })

  test('should log to console when disableInternalLogger is not specified (default behavior)', () => {
    const options: Options = {
      config: {}
    }

    const logger = createLogger(options)
    logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

    expect(consoleSpy).toHaveBeenCalled()
  })

  test('should not log to console when disableInternalLogger is true', () => {
    const options: Options = {
      config: {
        disableInternalLogger: true
      }
    }

    const logger = createLogger(options)
    logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

    expect(consoleSpy).not.toHaveBeenCalled()
  })

  test('should still call transports when disableInternalLogger is true', () => {
    const transportMock = mock(() => Promise.resolve())
    const options: Options = {
      config: {
        disableInternalLogger: true,
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

  test('should work with custom logger methods when disableInternalLogger is true', () => {
    const transportMock = mock(() => Promise.resolve())
    const options: Options = {
      config: {
        disableInternalLogger: true,
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

  test('should handle both console and transports when disableInternalLogger is false', () => {
    const transportMock = mock(() => Promise.resolve())
    const options: Options = {
      config: {
        disableInternalLogger: false,
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

  test('should handle file logging when disableInternalLogger is true', () => {
    const options: Options = {
      config: {
        disableInternalLogger: true,
        logFilePath: '/tmp/test.log'
      }
    }

    const logger = createLogger(options)

    // We don't test actual file writing here, but ensure console is not called
    logger.log('INFO', mockRequest, { message: 'Test message' }, mockStore)

    expect(consoleSpy).not.toHaveBeenCalled()
  })

  test('should handle error logging correctly when disableInternalLogger is true', () => {
    const transportMock = mock(() => Promise.resolve())
    const options: Options = {
      config: {
        disableInternalLogger: true,
        transports: [
          {
            log: transportMock
          }
        ]
      }
    }

    const logger = createLogger(options)
    const error = { status: 500, message: 'Internal Server Error' } as const

    logger.handleHttpError(
      mockRequest,
      error as unknown as HttpError,
      mockStore
    )

    expect(consoleSpy).not.toHaveBeenCalled()
    expect(transportMock).toHaveBeenCalled()
  })
})
