import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test'
import { Server } from '~/types'
import startServer from '~/utils/start'

describe('Start String', () => {
  let originalConsoleLog: any
  let mockConsoleLog: jest.Mock

  beforeEach(() => {
    originalConsoleLog = console.log
    mockConsoleLog = jest.fn()
    console.log = mockConsoleLog
  })

  afterEach(() => {
    console.log = originalConsoleLog
  })

  it('Correctly logs the expected message upon server start', () => {
    const config: Server = {
      hostname: 'localhost',
      port: 3000,
      protocol: 'http'
    }

    startServer(config)

    const expectedMessage = `🦊 Elysia is running at http://localhost:3000`

    // Extract the arguments passed to console.log during the function call
    const logMessage = mockConsoleLog.mock.calls
      .map((args: any[]) => args.join(' '))
      .join(' ')

    expect(logMessage).toMatch(expectedMessage)
  })
})
