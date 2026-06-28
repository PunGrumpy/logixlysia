import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia, useLogger } from '../../src'
import type { Options } from '../../src/interfaces'

describe('AsyncLocalStorage & useLogger() context integration', () => {
  test('derived log object is available on context and logs to transport', async () => {
    const transport = mock<(lvl: any, msg: any, meta?: any) => void>(
      () => undefined
    )
    const options: Options = {
      config: {
        transports: [{ log: transport }],
        disableInternalLogger: true,
        disableFileLogging: true
      }
    }

    const app = new Elysia()
      .use(logixlysia(options))
      .get('/test', ({ log }) => {
        log.mergeContext({ custom: 'val' })
        log.info('hello from derive')
        return 'ok'
      })

    await app.handle(new Request('http://localhost/test'))

    expect(transport).toHaveBeenCalledTimes(1)
    const [level, message, meta] = (transport.mock.calls[0] ?? []) as [
      any,
      any,
      any
    ]
    expect(level).toBe('INFO')
    expect(message).toBe('hello from derive')
    expect(meta.context).toEqual({ custom: 'val' })
  })

  test('useLogger() works within route handler and async boundaries when enabled', async () => {
    const transport = mock<(lvl: any, msg: any, meta?: any) => void>(
      () => undefined
    )
    const options: Options = {
      config: {
        transports: [{ log: transport }],
        disableInternalLogger: true,
        disableFileLogging: true,
        useAsyncLocalStorage: true
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', async () => {
      const log = useLogger()
      log.mergeContext({ deep: 'context' })
      log.info('hello from useLogger')

      // Nested async operation using actual Promise resolve to verify async hook context
      await new Promise<void>(resolve => {
        const nestedLog = useLogger()
        nestedLog.info('hello from nested')
        resolve()
      })

      return 'ok'
    })

    await app.handle(new Request('http://localhost/test'))

    expect(transport).toHaveBeenCalledTimes(2)
    const call1 = (transport.mock.calls[0] ?? []) as [any, any, any]
    const call2 = (transport.mock.calls[1] ?? []) as [any, any, any]

    expect(call1[0]).toBe('INFO')
    expect(call1[1]).toBe('hello from useLogger')
    expect(call1[2].context).toEqual({ deep: 'context' })

    expect(call2[0]).toBe('INFO')
    expect(call2[1]).toBe('hello from nested')
    expect(call2[2].context).toEqual({ deep: 'context' })
  })

  test('useLogger() does not crash and behaves as no-op when disabled', async () => {
    const transport = mock<(lvl: any, msg: any, meta?: any) => void>(
      () => undefined
    )
    const options: Options = {
      config: {
        transports: [{ log: transport }],
        disableInternalLogger: true,
        disableFileLogging: true,
        useAsyncLocalStorage: false
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => {
      const log = useLogger()
      log.info('this should be ignored')
      return 'ok'
    })

    await app.handle(new Request('http://localhost/test'))

    expect(transport).toHaveBeenCalledTimes(1)
    const [level, message] = (transport.mock.calls[0] ?? []) as [any, any]
    expect(level).toBe('INFO')
    expect(message).toBe('')
  })

  test('useLogger() outside request lifecycle does not crash and behaves as no-op', () => {
    const log = useLogger()
    expect(() => {
      log.info('outside request')
      log.mergeContext({ key: 'val' })
    }).not.toThrow()
  })
})
