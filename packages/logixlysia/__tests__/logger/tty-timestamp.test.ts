import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import type { LogixlysiaConfig } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { spyConsole } from '../_helpers/console'
import { createMockRequest } from '../_helpers/request'

const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')

const setIsTTY = (value: boolean) => {
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value
  })
}

afterEach(() => {
  setSystemTime()
  if (originalIsTTY) {
    Object.defineProperty(process.stdout, 'isTTY', originalIsTTY)
  } else {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  }
})

const NOW = new Date(2026, 10, 12, 9, 5, 7, 42)

const lineFor = (config: LogixlysiaConfig): string => {
  setSystemTime(NOW)
  const { spies, restore } = spyConsole()
  try {
    createLogger({
      config: { disableFileLogging: true, useColors: false, ...config }
    }).info(createMockRequest('http://localhost/hello'), 'hi')
    return String(spies.info.mock.calls[0]?.[0])
  } finally {
    restore()
  }
}

describe('console timestamp', () => {
  test('a TTY with the default format prints local HH:MM:ss.SSS', () => {
    setIsTTY(true)

    expect(lineFor({}).startsWith('09:05:07.042 INFO  GET')).toBe(true)
  })

  test('a non-TTY stdout keeps the full ISO timestamp', () => {
    setIsTTY(false)

    expect(lineFor({}).startsWith(`${NOW.toISOString()} INFO  GET`)).toBe(true)
  })

  test('an explicit translateTime wins on a TTY', () => {
    setIsTTY(true)
    const line = lineFor({ timestamp: { translateTime: 'yyyy-mm-dd HH:MM' } })

    expect(line.startsWith('2026-11-12 09:05 INFO  GET')).toBe(true)
  })

  test('an explicit empty timestamp object keeps the ISO timestamp on a TTY', () => {
    setIsTTY(true)

    expect(
      lineFor({ timestamp: {} }).startsWith(`${NOW.toISOString()} INFO`)
    ).toBe(true)
  })

  test('a customLogFormat keeps the ISO timestamp on a TTY', () => {
    setIsTTY(true)
    const line = lineFor({ customLogFormat: '{now} {method} {pathname}' })

    expect(line).toBe(`${NOW.toISOString()} GET     /hello`)
  })
})
