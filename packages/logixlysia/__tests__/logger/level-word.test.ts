import { afterEach, describe, expect, test } from 'bun:test'
import type { Logger, LogixlysiaConfig } from '../../src/interfaces'
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
  if (originalIsTTY) {
    Object.defineProperty(process.stdout, 'isTTY', originalIsTTY)
  } else {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  }
})

type ConsoleMethod = 'debug' | 'error' | 'info' | 'warn'

const capture = (
  config: LogixlysiaConfig,
  method: ConsoleMethod,
  act: (logger: Logger) => void
): string => {
  const { spies, restore } = spyConsole()
  try {
    act(createLogger({ config }))
    return String(spies[method].mock.calls[0]?.[0])
  } finally {
    restore()
  }
}

const request = createMockRequest('http://localhost/hello')

const lineFor = (config: LogixlysiaConfig, method: ConsoleMethod): string =>
  capture({ disableFileLogging: true, ...config }, method, logger => {
    logger[method](request, 'hi')
  })

describe('level word when colours are off', () => {
  test.each([
    ['debug', 'DEBUG'],
    ['info', 'INFO '],
    ['warn', 'WARN '],
    ['error', 'ERROR']
  ] as const)('useColors: false on a TTY prints %s as %p', (method, word) => {
    setIsTTY(true)
    const line = lineFor({ useColors: false }, method)

    expect(line).toMatch(
      new RegExp(`^\\S+ ${word} GET {5}/hello 200 \\S+ hi$`, 'u')
    )
    expect(line).not.toContain('🦊')
  })

  test('a non-TTY stdout prints the level word with default config', () => {
    setIsTTY(false)
    const line = lineFor({}, 'info')

    expect(line).toMatch(/^\S+ INFO {2}GET {5}\/hello 200 \S+ hi$/u)
    expect(line).not.toContain('🦊')
  })

  test('the service name still precedes the level word', () => {
    setIsTTY(false)
    const line = lineFor({ service: 'my-api' }, 'error')

    expect(line).toMatch(/^\S+ \[my-api\] ERROR GET /u)
  })
})
