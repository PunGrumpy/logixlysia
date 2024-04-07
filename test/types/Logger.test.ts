import { beforeEach, describe, expect, it, jest } from 'bun:test'
import { RequestInfo, LogData, StoreData } from '~/types'

interface Logger {
  info(request: RequestInfo, data: LogData, store: StoreData): void
  warning(request: RequestInfo, data: LogData, store: StoreData): void
  error(request: RequestInfo, data: LogData, store: StoreData): void
}

describe('Logger interface', () => {
  let logger: Logger

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      warning: jest.fn(),
      error: jest.fn()
    }
  })

  it('Defines the Logger interface correctly', () => {
    expect(logger).toEqual(
      expect.objectContaining({
        info: expect.any(Function),
        warning: expect.any(Function),
        error: expect.any(Function)
      })
    )
  })

  it('Calls the info log function with the correct arguments', () => {
    const request: RequestInfo = {
      url: '/info',
      method: 'GET',
      headers: {
        get: function () {
          throw new Error('Function not implemented.')
        }
      }
    }
    const data: LogData = { status: 200, message: 'Info log message' }
    const store: StoreData = {
      beforeTime: 0n
    }

    logger.info(request, data, store)

    expect(logger.info).toHaveBeenCalledWith(request, data, store)
  })

  it('Calls the warning log function with the correct arguments', () => {
    const request: RequestInfo = {
      url: '/warning',
      method: 'POST',
      headers: {
        get: function () {
          throw new Error('Function not implemented.')
        }
      }
    }
    const data: LogData = { status: 404, message: 'Warning log message' }
    const store: StoreData = {
      beforeTime: 0n
    }

    logger.warning(request, data, store)

    expect(logger.warning).toHaveBeenCalledWith(request, data, store)
  })

  it('Calls the error log function with the correct arguments', () => {
    const request: RequestInfo = {
      url: '/error',
      method: 'DELETE',
      headers: {
        get: function () {
          throw new Error('Function not implemented.')
        }
      }
    }
    const data: LogData = { status: 500, message: 'Error log message' }
    const store: StoreData = {
      beforeTime: 0n
    }

    logger.error(request, data, store)

    expect(logger.error).toHaveBeenCalledWith(request, data, store)
  })
})
