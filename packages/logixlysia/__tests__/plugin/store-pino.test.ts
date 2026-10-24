import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import type pino from 'pino'
import { logixlysia } from '../../src'
import type { Options, Pino } from '../../src/interfaces'
import { createLogger } from '../../src/logger'

const createCaptureTransport = () => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {}
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
  test('is defined on the store after use', async () => {
    const { options } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/pino', ({ store }) => ({
        defined: store.pino !== undefined,
        same: store.pino === store.logger.pino
      }))

    const response = await app.handle(new Request('http://localhost/pino'))

    expect(await response.json()).toEqual({ defined: true, same: true })
  })

  test('a handler can log through store.pino', async () => {
    const { options } = createCaptureTransport()
    const logMethod = mock<(inputArgs: unknown[]) => void>(() => {})
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

  test('an assignment to store.pino reaches pino', async () => {
    const { options } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/level', ({ store }) => {
        store.pino.level = 'debug'
        return store.pino.level
      })

    const response = await app.handle(new Request('http://localhost/level'))

    expect(await response.text()).toBe('debug')
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
