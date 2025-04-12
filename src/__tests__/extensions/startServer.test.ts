import { describe, expect, mock, test } from 'bun:test'

import { startServer } from '../../extensions'
import { Options } from '../../interfaces'

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

    startServer(mockServer as any, options)
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

    startServer(mockServer as any, options)
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('🦊 Elysia is running at')
    )
    expect(consoleLog).not.toHaveBeenCalledWith(expect.stringContaining('┌'))
    console.log = originalConsoleLog
  })
})
