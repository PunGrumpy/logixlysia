import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import type pino from 'pino'
import { logixlysia } from '../../src'
import type { Options, Pino } from '../../src/interfaces'
import { createLogger } from '../../src/logger'

const createCaptureTransport = () => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {
      /* noop */
    }
  )
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }]
    }
  }
  return { options, transport }
}

describe('store.pino', () => {
  test('is defined on the store after use', () => {
    const { options } = createCaptureTransport()
    const app = new Elysia().use(logixlysia(options))

    expect(app.store.pino).toBeDefined()
    expect(app.store.pino).toBe(app.store.logger.pino)
  })

  test('a handler can log through store.pino', async () => {
    const { options } = createCaptureTransport()
    // Captures the call instead of writing it, so pino's output stays out of
    // the test run.
    const logMethod = mock<(inputArgs: unknown[]) => void>(() => {
      /* noop */
    })
    const app = new Elysia()
      .use(
        logixlysia({
          ...options,
          config: { ...options.config, pino: { hooks: { logMethod } } }
        })
      )
      .get('/x', ({ store }) => {
        store.pino.info('hi')
        return 'ok'
      })

    const response = await app.handle(new Request('http://localhost/x'))

    expect(response.status).toBe(200)
    expect(logMethod).toHaveBeenCalledTimes(1)
    expect(logMethod.mock.calls[0]?.[0]).toEqual(['hi'])
  })

  test('an assignment to store.pino reaches pino', () => {
    const { options } = createCaptureTransport()
    const app = new Elysia().use(logixlysia(options))

    app.store.pino.level = 'debug'

    expect(app.store.pino.level).toBe('debug')
  })

  test('enumerating store.pino before first use does not construct pino', () => {
    const fakePinoInstance = { info: mock(() => {}) } as unknown as Pino
    const fakePinoFactory = mock(() => fakePinoInstance)
    const logger = createLogger({}, fakePinoFactory as unknown as typeof pino)

    Object.keys(logger.pino)
    expect(fakePinoFactory).not.toHaveBeenCalled()

    logger.pino.info({})
    expect(fakePinoFactory).toHaveBeenCalledTimes(1)
  })
})
