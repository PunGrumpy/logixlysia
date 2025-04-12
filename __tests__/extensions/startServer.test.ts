import { describe, expect, mock, test } from 'bun:test'

import { startServer } from '../../src/extensions'
import { Options } from '../../src/interfaces'

describe('startServer', () => {
  test('should show banner format by default', () => {
    const consoleLog = mock(() => {})
    const originalConsoleLog = console.log
    console.log = consoleLog

    const mockServer = {
      port: 3000,
      hostname: 'localhost',
      protocol: 'http'
    }
    const options: Options = {}

    startServer(mockServer, options)
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('┌'))
    console.log = originalConsoleLog
  })

  test('should show simple format when specified', () => {
    const consoleLog = mock(() => {})
    const originalConsoleLog = console.log
    console.log = consoleLog

    const mockServer = {
      port: 3000,
      hostname: 'localhost',
      protocol: 'http'
    }
    const options: Options = {
      config: {
        startupMessageFormat: 'simple'
      }
    }

    startServer(mockServer, options)
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('🦊 Elysia is running at')
    )
    expect(consoleLog).not.toHaveBeenCalledWith(expect.stringContaining('┌'))
    console.log = originalConsoleLog
  })
})
