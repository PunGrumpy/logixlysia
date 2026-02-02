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

    const options = captured.options as {
      transport?: { target?: string }
    }
    expect(options.transport?.target).toBe('pino-pretty')
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

    const options = captured.options as {
      transport?: { options?: { colorize?: boolean } }
    }
    expect(options.transport?.options?.colorize).toBe(false)
  })
})
