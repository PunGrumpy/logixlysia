import { beforeEach, describe, expect, it, jest } from 'bun:test'

import { logToTransports } from '~/transports'
import {
  LogData,
  LogLevel,
  Options,
  RequestInfo,
  StoreData,
  Transport
} from '~/types'

describe('Custom Transports', () => {
  let mockTransport: Transport
  let options: Options

  beforeEach(() => {
    mockTransport = {
      log: jest.fn().mockResolvedValue(undefined)
    }
    options = {
      config: {
        transports: [mockTransport]
      }
    }
  })

  it('should call the custom transport log function', async () => {
    const level: LogLevel = 'INFO'
    const request: RequestInfo = {
      url: '/test',
      method: 'GET',
      headers: { get: () => null }
    }
    const data: LogData = { status: 200 }
    const store: StoreData = { beforeTime: BigInt(0) }

    await logToTransports(level, request, data, store, options)

    expect(mockTransport.log).toHaveBeenCalledTimes(1)
    expect(mockTransport.log).toHaveBeenCalledWith(level, expect.any(String), {
      request,
      data,
      store
    })
  })

  it('should not call any transports if none are configured', async () => {
    const options: Options = { config: {} }
    const level: LogLevel = 'INFO'
    const request: RequestInfo = {
      url: '/test',
      method: 'GET',
      headers: { get: () => null }
    }
    const data: LogData = { status: 200 }
    const store: StoreData = { beforeTime: BigInt(0) }

    await logToTransports(level, request, data, store, options)

    expect(mockTransport.log).not.toHaveBeenCalled()
  })

  it('should call multiple transports if configured', async () => {
    const secondMockTransport: Transport = {
      log: jest.fn().mockResolvedValue(undefined)
    }
    options.config!.transports!.push(secondMockTransport)

    const level: LogLevel = 'INFO'
    const request: RequestInfo = {
      url: '/test',
      method: 'GET',
      headers: { get: () => null }
    }
    const data: LogData = { status: 200 }
    const store: StoreData = { beforeTime: BigInt(0) }

    await logToTransports(level, request, data, store, options)

    expect(mockTransport.log).toHaveBeenCalledTimes(1)
    expect(secondMockTransport.log).toHaveBeenCalledTimes(1)
  })
})
