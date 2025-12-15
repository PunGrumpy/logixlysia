import { describe, expect, mock, test } from 'bun:test'

import { logToTransports } from '../../packages/cli/output'

describe('logToTransports', () => {
  test('should log to console by default', () => {
    const transportMock = mock(() => {
      return
    })
    const logData = {
      level: 'INFO',
      message: 'Test message',
      timestamp: new Date().toISOString()
    }

    logToTransports(
      'INFO',
      new Request('http://localhost'),
      logData,
      { beforeTime: BigInt(0) },
      {
        config: {
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }
    )
    expect(transportMock).toHaveBeenCalled()
  })

  test('should handle different log levels', () => {
    const transportMock = mock(() => {
      return
    })
    const logData = {
      level: 'ERROR',
      message: 'Error message',
      timestamp: new Date().toISOString()
    }

    logToTransports(
      'ERROR',
      new Request('http://localhost'),
      logData,
      { beforeTime: BigInt(0) },
      {
        config: {
          transports: [
            {
              log: transportMock
            }
          ]
        }
      }
    )
    expect(transportMock).toHaveBeenCalled()
  })
})
