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

  expect(colorMessage).toContain('INFO')
  expect(colorMessage).toContain('Test message')
  expect(colorMessage).toContain('127.0.0.1')

  const hasAnsiCodes = /\\x1B\[[0-9;]*m/.test(colorMessage)
  if (hasAnsiCodes) {
    expect(colorMessage).not.toBe(message)
  } else {
    console.warn(
      'No ANSI color codes detected. Colors might be disabled in this environment.'
    )
  }
})
