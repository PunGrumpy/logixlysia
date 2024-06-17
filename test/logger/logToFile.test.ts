import { afterEach, describe, expect, it, jest, mock } from 'bun:test'

import { logToFile } from '~/logger/logToFile'
import { LogData, LogLevel, Options, RequestInfo, StoreData } from '~/types'

const mockAppendFile = jest.fn()
const mockMkdir = jest.fn()

mock.module('fs', () => ({
  promises: {
    appendFile: mockAppendFile,
    mkdir: mockMkdir
  }
}))

describe('Log to file', () => {
  const filePath = 'logs/test.log'
  const level: LogLevel = 'INFO'
  const request: RequestInfo = {
    headers: { get: () => 'test-header-value' },
    method: 'GET',
    url: 'https://pungrumpy.com/logixlysia/test'
  }
  const data: LogData = { status: 200, message: 'OK' }
  const store: StoreData = { beforeTime: BigInt(1234567890) }
  const options: Options = {
    config: {
      customLogFormat: '{method} {status} {message}'
    }
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Should log a message to a file without options', async () => {
    await logToFile(filePath, level, request, data, store)

    expect(mockMkdir).toHaveBeenCalled()
    expect(mockAppendFile).toHaveBeenCalled()
  })

  it('Should log a message to a file with options', async () => {
    await logToFile(filePath, level, request, data, store, options)

    expect(mockMkdir).toHaveBeenCalled()
    expect(mockAppendFile).toHaveBeenCalled()
  })

  it('Should log a message to a file with custom log format', async () => {
    await logToFile(filePath, level, request, data, store, options)

    expect(mockMkdir).toHaveBeenCalled()
    expect(mockAppendFile).toHaveBeenCalled()
  })
})
