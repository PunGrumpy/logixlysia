import { expect, test } from 'bun:test'

import { buildLogMessage } from '../../src/core/buildLogMessage'
import { LogData, LogLevel, Options, StoreData } from '../../src/types'
import { createMockRequest } from '../helpers'

test('buildLogMessage', () => {
  const level: LogLevel = 'INFO'
  const request = createMockRequest()
  const data: LogData = { status: 200, message: 'Test message' }
  const store: StoreData = { beforeTime: BigInt(0) }
  const options: Options = {
    config: {
      ip: true,
      customLogFormat: '{level} {message} {ip}'
    }
  }

  const message = buildLogMessage(level, request, data, store, options, false)
  expect(message).toContain('INFO')
  expect(message).toContain('Test message')
  expect(message).toContain('127.0.0.1')

  const colorMessage = buildLogMessage(
    level,
    request,
    data,
    store,
    options,
    true
  )
  expect(colorMessage).toContain('\x1b[') // ANSI color codes
})
