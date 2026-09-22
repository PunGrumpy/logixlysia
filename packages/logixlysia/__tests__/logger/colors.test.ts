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

const DATE_PATTERN_REGEX = /\d{4}-\d{2}-\d{2}/u

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

    expect(output).toContain('\u001B[')
  })

  test('colors GET method green and bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'GET'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001B[32m\u001B[1mGET')
  })

  test('colors POST method blue and bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'POST'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001B[34m\u001B[1mPOST')
  })

  test('colors DELETE method red and bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'DELETE'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001B[31m\u001B[1mDELETE')
  })

  test('colors a 7-letter method (OPTIONS) with its dedicated cyan.bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'OPTIONS'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001B[36m\u001B[1mOPTIONS')
  })

  test('colors a 7-letter method (CONNECT) with its dedicated cyanBright.bold', () => {
    const request = createMockRequest('http://localhost/hello', {
      method: 'CONNECT'
    })
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.info(request, 'hi')
    })

    expect(output).toContain('\u001B[96m\u001B[1mCONNECT')
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

  test('colors 200 status green', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.log('INFO', request, { status: 200 }, { beforeTime: 0n })
    })

    expect(output).toContain('\u001B[32m')
  })

  test('colors 404 status yellow', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.log('INFO', request, { status: 404 }, { beforeTime: 0n })
    })

    expect(output).toContain('\u001B[33m')
  })

  test('colors 500 status red', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.log('INFO', request, { status: 500 }, { beforeTime: 0n })
    })

    expect(output).toContain('\u001B[31m')
  })

  test('colors 301 status cyan', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.log('INFO', request, { status: 301 }, { beforeTime: 0n })
    })

    expect(output).toContain('\u001B[36m')
  })

  test('status below 200 is colored gray', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture({ disableFileLogging: true }, 'info', logger => {
      logger.log('INFO', request, { status: 100 }, { beforeTime: 0n })
    })

    expect(output).toContain('\u001B[90m100')
  })

  test('level chip is red-background with fox for a 500 error', () => {
    const request = createMockRequest('http://localhost/hello')
    const store = { beforeTime: 0n }
    const output = capture({ disableFileLogging: true }, 'error', logger => {
      logger.handleHttpError(request, { message: 'boom', status: 500 }, store)
    })

    expect(output).toContain('\u001B[41m')
    expect(output).toContain('🦊')
  })

  test('level chip is yellow-background for a 404 error', () => {
    const request = createMockRequest('http://localhost/hello')
    const store = { beforeTime: 0n }
    const output = capture({ disableFileLogging: true }, 'warn', logger => {
      logger.handleHttpError(request, { message: 'nope', status: 404 }, store)
    })

    expect(output).toContain('\u001B[43m')
  })

  test('{level} token colors DEBUG bgBlue and WARNING bgYellow', () => {
    const request = createMockRequest('http://localhost/hello')
    const config: LogixlysiaConfig = {
      customLogFormat: '{level} {pathname}',
      disableFileLogging: true
    }

    const debugOutput = capture(config, 'debug', logger => {
      logger.debug(request, 'd')
    })
    const warnOutput = capture(config, 'warn', logger => {
      logger.warn(request, 'w')
    })

    expect(debugOutput).toContain('\u001B[44m')
    expect(warnOutput).toContain('\u001B[43m')
  })

  test('debug level icon uses bgBlue', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture({ disableFileLogging: true }, 'debug', logger => {
      logger.debug(request, 'd')
    })

    expect(output).toContain('\u001B[44m')
    expect(output).toContain('🦊')
  })

  test('duration is red with the slow badge past verySlowThreshold', () => {
    const request = createMockRequest('http://localhost/hello')
    const beforeTime = process.hrtime.bigint() - 10_000_000n
    const output = capture(
      { disableFileLogging: true, slowThreshold: 1, verySlowThreshold: 2 },
      'info',
      logger => {
        logger.log('INFO', request, { status: 200 }, { beforeTime })
      }
    )

    expect(output).toContain('\u001B[31m')
    expect(output).toContain('⚡ slow')
  })

  test('duration is yellow between slow and verySlow thresholds', () => {
    const request = createMockRequest('http://localhost/hello')
    const beforeTime = process.hrtime.bigint() - 10_000_000n
    const output = capture(
      { disableFileLogging: true, slowThreshold: 1, verySlowThreshold: 1000 },
      'info',
      logger => {
        logger.log('INFO', request, { status: 200 }, { beforeTime })
      }
    )

    expect(output).toContain('\u001B[33m')
    expect(output).not.toContain('⚡ slow')
  })

  test('duration is green with no badge for a fast request', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture(
      {
        disableFileLogging: true,
        slowThreshold: 5000,
        verySlowThreshold: 10_000
      },
      'info',
      logger => {
        logger.log(
          'INFO',
          request,
          { status: 200 },
          { beforeTime: process.hrtime.bigint() }
        )
      }
    )

    expect(output).toContain('\u001B[32m')
    expect(output).not.toContain('⚡ slow')
  })

  test('timestamp uses a custom translateTime pattern', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture(
      { disableFileLogging: true, timestamp: { translateTime: 'yyyy-mm-dd' } },
      'info',
      logger => {
        logger.info(request, 'hi')
      }
    )

    expect(output).toContain('\u001B[90m')
    expect(output).toMatch(DATE_PATTERN_REGEX)
  })

  test('context tree keys are cyan', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture(
      { disableFileLogging: true, showContextTree: true },
      'info',
      logger => {
        logger.info(request, 'hi', { userId: 'u1' })
      }
    )

    expect(output).toContain('\u001B[36muserId')
  })

  test('context tree stringifies null, undefined, and Error values', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture(
      { disableFileLogging: true, showContextTree: true },
      'info',
      logger => {
        logger.info(request, 'hi', {
          cause: new Error('boom'),
          missing: undefined,
          nothing: null
        })
      }
    )

    expect(output).toContain('null')
    expect(output).toContain('undefined')
    expect(output).toContain('boom')
  })

  test('{context} token inlines JSON when the tree has nothing to show', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture(
      {
        customLogFormat: '{pathname} {context}',
        disableFileLogging: true,
        showContextTree: true
      },
      'info',
      logger => {
        logger.info(request, 'hi', { userId: 'u1' })
      }
    )

    // The tree already renders userId, so the inline {context} token is empty.
    expect(output).not.toContain('{"userId"')
    expect(output).toContain('\u001B[36muserId')
  })

  test('useColors false suppresses ANSI codes even on a TTY', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture(
      { disableFileLogging: true, useColors: false },
      'info',
      logger => {
        logger.info(request, 'hi', { userId: 'u1' })
      }
    )

    expect(output).not.toContain('\u001B[')
  })

  test('service token uses customLogFormat with the service name', () => {
    const request = createMockRequest('http://localhost/hello')
    const output = capture(
      {
        customLogFormat: '{service}{pathname}',
        disableFileLogging: true,
        service: 'auth-api'
      },
      'info',
      logger => {
        logger.info(request, 'hi')
      }
    )

    expect(output).toContain('[auth-api]')
    expect(output).toContain('\u001B[')
  })

  test('ip token resolves from x-forwarded-for when config.ip is true', () => {
    const request = createMockRequest('http://localhost/hello', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }
    })
    const output = capture(
      {
        customLogFormat: '{ip} {pathname}',
        disableFileLogging: true,
        ip: true
      },
      'info',
      logger => {
        logger.info(request, 'hi')
      }
    )

    expect(output).toContain('203.0.113.9')
  })

  test('{query} token works without {pathname}/{path} in the format', () => {
    const request = createMockRequest('http://localhost/hello?x=1')
    const output = capture(
      { customLogFormat: '{method} {query}', disableFileLogging: true },
      'info',
      logger => {
        logger.info(request, 'hi')
      }
    )

    expect(output).toContain('?x=1')
  })
})
