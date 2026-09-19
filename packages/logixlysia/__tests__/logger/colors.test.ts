import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import chalk from 'chalk'
import type { Logger, LogixlysiaConfig } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { spyConsole } from '../_helpers/console'
import { createMockRequest } from '../_helpers/request'

const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
const originalLevel = chalk.level

beforeAll(() => {
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value: true
  })
  chalk.level = 3
})

afterAll(() => {
  chalk.level = originalLevel
  if (originalIsTTY) {
    Object.defineProperty(process.stdout, 'isTTY', originalIsTTY)
  } else {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  }
})

type ConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn'

/** Creates a logger with `config`, runs `act` against it, and returns the string
 * logged to `console[method]` (as an internal-console-sink test always emits
 * to exactly one console method per act). */
const capture = (
  config: LogixlysiaConfig,
  method: ConsoleMethod,
  act: (logger: Logger) => void
): string => {
  const { spies, restore } = spyConsole()
  const logger = createLogger({ config })
  act(logger)
  const output = String(spies[method].mock.calls[0]?.[0])
  restore()
  return output
}

describe('colorized console output', () => {
  test('emits ANSI when stdout is a TTY', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001b[')
  })

  test('colors GET method green and bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'GET'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001b[32m\u001b[1mGET')
  })

  test('colors POST method blue and bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'POST'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001b[34m\u001b[1mPOST')
  })

  test('colors DELETE method red and bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'DELETE'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001b[31m\u001b[1mDELETE')
  })

  test('colors a 7-letter method (OPTIONS) with its dedicated cyan.bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'OPTIONS'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001b[36m\u001b[1mOPTIONS')
  })

  test('colors a 7-letter method (CONNECT) with its dedicated cyanBright.bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'CONNECT'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001b[96m\u001b[1mCONNECT')
  })

  test('useColors false keeps the {method} token byte-identical to plain padEnd', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'GET'
    })
    const output = capture(
      {
        customLogFormat: '{method}',
        disableFileLogging: true,
        useColors: false
      },
      'info',
      logger => {
        logger.info(request, 'hi')
      }
    )

    expect(output).toBe('GET'.padEnd(7))
  })
})
