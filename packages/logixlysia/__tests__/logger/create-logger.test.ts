import { describe, expect, mock, test } from 'bun:test'
import type pino from 'pino'
import type { Options, Pino } from '../../src/interfaces'

let prettyOptionsCaptured: any = null
mock.module('pino-pretty', () => ({
  default: (opts: any) => {
    prettyOptionsCaptured = opts
    return { prettyStreamMock: true }
  }
}))

import { createLogger } from '../../src/logger'
import { spyConsole } from '../_helpers/console'
import { createMockRequest } from '../_helpers/request'

describe('createLogger', () => {
  test('returns a logger with expected methods', () => {
    const logger = createLogger()
    expect(logger.pino).toBeDefined()
    expect(typeof logger.log).toBe('function')
    expect(typeof logger.handleHttpError).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  test('respects disableInternalLogger and still calls transports', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    })
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }]
      }
    }

    const { spies, restore } = spyConsole()

    const logger = createLogger(options)
    const request = createMockRequest('http://localhost/test')

    logger.info(request, 'hello')

    // transport should be invoked synchronously
    expect(transport).toHaveBeenCalledTimes(1)
    const [firstCall] = transport.mock.calls
    expect(firstCall).toBeDefined()
    const [levelValue, messageValue] = firstCall ?? [undefined, undefined]
    expect(levelValue).toBe('INFO')
    expect(messageValue).toBe('hello')

    // internal console output should be disabled
    expect(spies.log).not.toHaveBeenCalled()
    expect(spies.info).not.toHaveBeenCalled()
    expect(spies.warn).not.toHaveBeenCalled()
    expect(spies.error).not.toHaveBeenCalled()
    expect(spies.debug).not.toHaveBeenCalled()

    restore()

    // Avoid unhandled async noise if any transport returns a promise in future
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  test('autoRedact redacts request URL in transport meta', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    })
    const sampleJwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const options: Options = {
      config: {
        autoRedact: true,
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }]
      }
    }

    const logger = createLogger(options)
    const request = createMockRequest(
      `http://localhost/test?token=${sampleJwt}`
    )

    logger.info(request, 'hello')

    expect(transport).toHaveBeenCalledTimes(1)
    const meta = transport.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined
    const reqMeta = meta?.request as { url?: string } | undefined
    expect(reqMeta?.url).toContain('[REDACTED]')
    expect(reqMeta?.url).not.toContain(sampleJwt)

    await new Promise(resolve => setTimeout(resolve, 0))
  })

  test('handleHttpError emits transport error log', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    })
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }]
      }
    }

    const logger = createLogger(options)
    const request = createMockRequest('http://localhost/test')
    const store = { beforeTime: BigInt(0) }

    logger.handleHttpError(request, { message: 'bad', status: 400 }, store)
    logger.handleHttpError(request, { message: 'down', status: 503 }, store)

    expect(transport).toHaveBeenCalledTimes(2)
    const [firstLevelValue] = transport.mock.calls[0] ?? [undefined]
    expect(firstLevelValue).toBe('WARNING')
    const [secondLevelValue] = transport.mock.calls[1] ?? [undefined]
    expect(secondLevelValue).toBe('ERROR')

    await new Promise(resolve => setTimeout(resolve, 0))
  })

  test('prettyPrint true configures pino-pretty transport', () => {
    prettyOptionsCaptured = null
    const captured: { options?: any; stream?: any } = {}
    const fakePino = (options: any, stream: any) => {
      captured.options = options
      captured.stream = stream
      return {} as unknown as Pino
    }

    createLogger(
      {
        config: {
          pino: {
            prettyPrint: true
          }
        }
      },
      fakePino as unknown as typeof pino
    )

    expect(captured.stream).toEqual({ prettyStreamMock: true })
    expect(prettyOptionsCaptured).toMatchObject({
      colorize: process.stdout?.isTTY === true
    })
  })

  test('prettyPrint options override defaults', () => {
    prettyOptionsCaptured = null
    const captured: { options?: any; stream?: any } = {}
    const fakePino = (options: any, stream: any) => {
      captured.options = options
      captured.stream = stream
      return {} as unknown as Pino
    }

    createLogger(
      {
        config: {
          pino: {
            prettyPrint: {
              colorize: false
            }
          }
        }
      },
      fakePino as unknown as typeof pino
    )

    expect(captured.stream).toEqual({ prettyStreamMock: true })
    expect(prettyOptionsCaptured).toMatchObject({
      colorize: false
    })
  })

  test('prettyPrint does NOT configure transport when explicit transport exists', () => {
    const captured: { options?: unknown } = {}
    const fakePino = (options: unknown) => {
      captured.options = options
      return {} as unknown as Pino
    }

    const explicitTransport = { target: 'custom-transport' }

    createLogger(
      {
        config: {
          pino: {
            prettyPrint: true,
            transport: explicitTransport
          }
        }
      },
      fakePino as unknown as typeof pino
    )

    expect(captured.options).toMatchObject({
      transport: { target: 'custom-transport' }
    })
    expect(captured.options).not.toMatchObject({
      transport: { target: 'pino-pretty' }
    })
  })

  test('prettyPrint uses messageKey override when provided', () => {
    prettyOptionsCaptured = null
    const captured: { options?: any; stream?: any } = {}
    const fakePino = (options: any, stream: any) => {
      captured.options = options
      captured.stream = stream
      return {} as unknown as Pino
    }

    createLogger(
      {
        config: {
          pino: {
            prettyPrint: {
              messageKey: 'customMessage'
            }
          }
        }
      },
      fakePino as unknown as typeof pino
    )

    expect(prettyOptionsCaptured).toMatchObject({
      messageKey: 'customMessage'
    })
  })

  test('prettyPrint uses errorKey override when provided', () => {
    prettyOptionsCaptured = null
    const captured: { options?: any; stream?: any } = {}
    const fakePino = (options: any, stream: any) => {
      captured.options = options
      captured.stream = stream
      return {} as unknown as Pino
    }

    createLogger(
      {
        config: {
          pino: {
            prettyPrint: {
              errorKey: 'customError'
            }
          }
        }
      },
      fakePino as unknown as typeof pino
    )

    expect(prettyOptionsCaptured).toMatchObject({
      errorKey: 'customError'
    })
  })

  test('does not call pinoFactory across console-path logging when config.pino is absent', () => {
    const fakePinoFactory = mock(() => ({}) as Pino)

    const logger = createLogger({}, fakePinoFactory as unknown as typeof pino)
    const request = createMockRequest('http://localhost/test')

    const { restore } = spyConsole()
    logger.info(request, 'hello')
    logger.warn(request, 'careful')
    logger.error(request, 'oops')
    logger.debug(request, 'trace')
    restore()

    expect(fakePinoFactory).not.toHaveBeenCalled()
  })

  test('constructs pino exactly once on first logger.pino access, not again on subsequent access', () => {
    const fakePinoInstance = { info: mock(() => undefined) } as unknown as Pino
    const fakePinoFactory = mock(() => fakePinoInstance)

    const logger = createLogger({}, fakePinoFactory as unknown as typeof pino)

    expect(fakePinoFactory).not.toHaveBeenCalled()

    logger.pino.info({})
    expect(fakePinoFactory).toHaveBeenCalledTimes(1)

    logger.pino.info({})
    expect(fakePinoFactory).toHaveBeenCalledTimes(1)
  })

  test('logger.pino.child returns a working child logger through the lazy proxy', () => {
    const childInfo = mock(() => undefined)
    const fakeChildLogger = { info: childInfo }
    const fakePinoInstance = {
      child: mock((bindings: Record<string, unknown>) => {
        expect(bindings).toEqual({ a: 1 })
        return fakeChildLogger
      })
    } as unknown as Pino
    const fakePinoFactory = mock(() => fakePinoInstance)

    const logger = createLogger({}, fakePinoFactory as unknown as typeof pino)

    const child = logger.pino.child({ a: 1 })
    child.info({ ok: true })

    expect(fakePinoFactory).toHaveBeenCalledTimes(1)
    expect(childInfo).toHaveBeenCalledTimes(1)
  })

  test('config.pino present constructs pino eagerly during createLogger', () => {
    const fakePinoFactory = mock(() => ({}) as Pino)

    createLogger(
      { config: { pino: {} } },
      fakePinoFactory as unknown as typeof pino
    )

    expect(fakePinoFactory).toHaveBeenCalledTimes(1)
  })

  test('prettyPrint merges with default translateTime from config', () => {
    prettyOptionsCaptured = null
    const captured: { options?: any; stream?: any } = {}
    const fakePino = (options: any, stream: any) => {
      captured.options = options
      captured.stream = stream
      return {} as unknown as Pino
    }

    createLogger(
      {
        config: {
          pino: {
            prettyPrint: {
              colorize: true
            }
          },
          timestamp: {
            translateTime: 'yyyy-mm-dd HH:MM:ss'
          }
        }
      },
      fakePino as unknown as typeof pino
    )

    expect(prettyOptionsCaptured).toMatchObject({
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss'
    })
  })
})
