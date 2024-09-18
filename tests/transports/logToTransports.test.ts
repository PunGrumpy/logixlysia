import { expect, mock, test } from 'bun:test'

import { logToTransports } from '../../src/transports'
import { LogData, LogLevel, Options, StoreData } from '../../src/types'
import { createMockRequest } from '../helpers'

test('logToTransports', async () => {
  const level: LogLevel = 'INFO'
  const request = createMockRequest()
  const data: LogData = { status: 200, message: 'Test message' }
  const store: StoreData = { beforeTime: BigInt(0) }

  const mockTransport = {
    log: mock(() => Promise.resolve())
  }

  const options: Options = {
    config: {
      transports: [mockTransport]
    }
  }

  await logToTransports(level, request, data, store, options)
  expect(mockTransport.log).toHaveBeenCalled()

  // Test with no transports
  await logToTransports(level, request, data, store, {})
  expect(mockTransport.log).toHaveBeenCalledTimes(1) // Should not be called again
})
