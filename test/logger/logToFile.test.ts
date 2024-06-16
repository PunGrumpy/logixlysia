import { describe, it } from 'bun:test'

import { logToFile } from '~/logger/logToFile'
import { LogData, LogLevel, Options, RequestInfo, StoreData } from '~/types'

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

  it('Should log a message to a file without options', async () => {
    await logToFile(filePath, level, request, data, store)
  })

  it('Should log a message to a file without data', async () => {
    await logToFile(filePath, level, request, {}, store)
  })

  it('Should log a message to a file with options', async () => {
    await logToFile(filePath, level, request, data, store, options)
  })
})
