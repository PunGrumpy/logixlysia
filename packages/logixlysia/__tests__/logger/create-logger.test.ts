import { describe, expect, mock, test } from 'bun:test'
import type { Options, Pino } from '../../src/interfaces'
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
        transports: [{ log: transport }],
        disableInternalLogger: true,
        disableFileLogging: true
      }
    }

    const { spies, restore } = spyConsole()

    const logger = createLogger(options)
    const request = createMockRequest('http://localhost/test')

    logger.info(request, 'hello')

    // transport should be invoked synchronously
    expect(transport).toHaveBeenCalledTimes(1)
    const firstCall = transport.mock.calls[0]
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

  test('handleHttpError emits transport error log', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    })
    const options: Options = {
      config: {
        transports: [{ log: transport }],
        disableInternalLogger: true,
        disableFileLogging: true
      }
    }

    const logger = createLogger(options)
    const request = createMockRequest('http://localhost/test')
    const store = { beforeTime: BigInt(0) }

    logger.handleHttpError(request, { status: 400, message: 'bad' }, store)

    expect(transport).toHaveBeenCalledTimes(1)
    const [levelValue] = transport.mock.calls[0] ?? [undefined]
    expect(levelValue).toBe('ERROR')

    await new Promise(resolve => setTimeout(resolve, 0))
  })

  test('prettyPrint true configures pino-pretty transport', () => {
    const captured: { options?: unknown } = {}
    const fakePino = (options: unknown) => {
      captured.options = options
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
      fakePino
    )

    expect(captured.options).toMatchObject({
      transport: { target: 'pino-pretty' }
    })
  })

  test('prettyPrint options override defaults', () => {
    const captured: { options?: unknown } = {}
    const fakePino = (options: unknown) => {
      captured.options = options
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
      fakePino
    )

    expect(captured.options).toMatchObject({
      transport: { options: { colorize: false } }
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
      fakePino
    )

    expect(captured.options).toMatchObject({
      transport: { target: 'custom-transport' }
    })
    expect(captured.options).not.toMatchObject({
      transport: { target: 'pino-pretty' }
    })
  })

  test('prettyPrint uses messageKey override when provided', () => {
    const captured: { options?: unknown } = {}
    const fakePino = (options: unknown) => {
      captured.options = options
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
      fakePino
    )

    expect(captured.options).toMatchObject({
      transport: {
        options: { messageKey: 'customMessage' }
      }
    })
  })

  test('prettyPrint uses errorKey override when provided', () => {
    const captured: { options?: unknown } = {}
    const fakePino = (options: unknown) => {
      captured.options = options
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
      fakePino
    )

    expect(captured.options).toMatchObject({
      transport: {
        options: { errorKey: 'customError' }
      }
    })
  })

  test('prettyPrint merges with default translateTime from config', () => {
    const captured: { options?: unknown } = {}
    const fakePino = (options: unknown) => {
      captured.options = options
      return {} as unknown as Pino
    }

    createLogger(
      {
        config: {
          timestamp: {
            translateTime: 'yyyy-mm-dd HH:MM:ss'
          },
          pino: {
            prettyPrint: {
              colorize: true
            }
          }
        }
      },
      fakePino
    )

    expect(captured.options).toMatchObject({
      transport: {
        options: {
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          colorize: true
        }
      }
    })
  })
})
