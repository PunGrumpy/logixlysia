import { describe, expect, mock, test } from 'bun:test'
import type { Options } from '../../src/interfaces'
import { logToTransports } from '../../src/output'
import { spyConsole } from '../_helpers/console'
import { createMockRequest } from '../_helpers/request'

describe('logToTransports', () => {
  test('calls all transports with level/message/meta', () => {
    const t1 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {
        /* noop */
      }
    )
    const t2 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {
        /* noop */
      }
    )

    const options: Options = {
      config: {
        transports: [{ log: t1 }, { log: t2 }]
      }
    }

    const request = createMockRequest('http://localhost/hello')
    const store = { beforeTime: BigInt(0) }

    logToTransports({
      data: { message: 'Test message', status: 200 },
      level: 'INFO',
      options,
      request,
      store
    })

    expect(t1).toHaveBeenCalledTimes(1)
    expect(t2).toHaveBeenCalledTimes(1)

    const [firstCall] = t1.mock.calls
    expect(firstCall).toBeDefined()
    const [levelValue, messageValue, metaValue] = firstCall ?? [
      undefined,
      undefined,
      undefined
    ]
    expect(levelValue).toBe('INFO')
    expect(messageValue).toBe('Test message')
    expect(metaValue).toBeTypeOf('object')
    const meta = metaValue as unknown as Record<string, unknown>
    expect(meta.beforeTime).toBeUndefined()
    expect(meta.durationMs).toBeTypeOf('number')
    expect(() => JSON.stringify(meta)).not.toThrow()

    const req = meta.request as { method?: unknown; url?: unknown } | undefined
    expect(req?.method).toBe('GET')
    expect(req?.url).toBe('http://localhost/hello')
  })

  test('computes durationMs from store.beforeTime', () => {
    const t1 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {
        /* noop */
      }
    )
    const options: Options = { config: { transports: [{ log: t1 }] } }
    const request = createMockRequest('http://localhost/hello')

    const beforeTime = process.hrtime.bigint()
    const store = { beforeTime }

    logToTransports({
      data: { message: 'Test message' },
      level: 'INFO',
      options,
      request,
      store
    })

    const meta = t1.mock.calls[0]?.[2] as Record<string, unknown>
    expect(meta.durationMs).toBeTypeOf('number')
    expect(meta.durationMs as number).toBeGreaterThan(0)
    expect(Number.isFinite(meta.durationMs as number)).toBe(true)

    const t2 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {
        /* noop */
      }
    )
    const zeroOptions: Options = { config: { transports: [{ log: t2 }] } }
    const zeroStore = { beforeTime: BigInt(0) }

    logToTransports({
      data: { message: 'Test message' },
      level: 'INFO',
      options: zeroOptions,
      request,
      store: zeroStore
    })

    const zeroMeta = t2.mock.calls[0]?.[2] as Record<string, unknown>
    expect(zeroMeta.durationMs).toBe(0)
  })

  // This test must run before any other test that triggers a transport
  // failure (e.g. the "never throws"/"swallows async rejections" tests
  // below): `reportTransportError`'s rate limit is module-scoped state that
  // persists across tests in this file, so it must observe the very first
  // failure to reliably assert both the log and the rate limit.
  test('reports a throwing transport to stderr, rate-limited', () => {
    const { spies, restore } = spyConsole(['error'])

    try {
      const throwing = mock<
        (lvl: unknown, msg: unknown, metaArg?: unknown) => void
      >(() => {
        throw new Error('boom')
      })

      const options: Options = { config: { transports: [{ log: throwing }] } }
      const request = createMockRequest('http://localhost/throw')
      const store = { beforeTime: BigInt(0) }

      logToTransports({
        data: { message: 'ignored' },
        level: 'INFO',
        options,
        request,
        store
      })

      expect(spies.error).toHaveBeenCalledTimes(1)
      const [firstErrorCall] = spies.error.mock.calls
      expect(firstErrorCall?.[0]).toContain('transport failed')

      // A second immediate failure must not log again (rate limit).
      logToTransports({
        data: { message: 'ignored again' },
        level: 'INFO',
        options,
        request,
        store
      })

      expect(spies.error).toHaveBeenCalledTimes(1)
    } finally {
      restore()
    }
  })

  test('never throws when a transport throws', () => {
    const throwing = mock<
      (lvl: unknown, msg: unknown, metaArg?: unknown) => void
    >(() => {
      throw new Error('boom')
    })

    const options: Options = { config: { transports: [{ log: throwing }] } }
    const request = createMockRequest('http://localhost/throw')
    const store = { beforeTime: BigInt(0) }

    expect(() => {
      logToTransports({
        data: { message: 'ignored' },
        level: 'INFO',
        options,
        request,
        store
      })
    }).not.toThrow()
  })

  test('swallows async transport rejections', async () => {
    const rejecting = mock<
      (lvl: unknown, msg: unknown, metaArg?: unknown) => Promise<void>
    >(() => Promise.reject(new Error('nope')))

    const options: Options = { config: { transports: [{ log: rejecting }] } }
    const request = createMockRequest('http://localhost/reject')
    const store = { beforeTime: BigInt(0) }

    logToTransports({
      data: { message: 'async' },
      level: 'INFO',
      options,
      request,
      store
    })

    // Let promise microtasks run; rejections should be caught internally.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(rejecting).toHaveBeenCalledTimes(1)
  })

  test('invokes config.onError with sink "transport" instead of the rate-limited stderr fallback, and swallows a throwing hook', () => {
    const throwing = mock<
      (lvl: unknown, msg: unknown, metaArg?: unknown) => void
    >(() => {
      throw new Error('boom')
    })
    const onError = mock((_context: unknown) => {
      throw new Error('hook boom')
    })

    const options: Options = {
      config: { onError, transports: [{ log: throwing }] }
    }
    const request = createMockRequest('http://localhost/throw')
    const store = { beforeTime: BigInt(0) }

    expect(() => {
      logToTransports({
        data: { message: 'ignored' },
        level: 'INFO',
        options,
        request,
        store
      })
    }).not.toThrow()

    expect(onError).toHaveBeenCalledTimes(1)
    const [context] = onError.mock.calls[0] ?? [undefined]
    const { sink, error } = (context ?? {}) as {
      error?: unknown
      sink?: unknown
    }
    expect(sink).toBe('transport')
    expect(error).toBeDefined()

    // A second immediate failure still invokes the hook (unlike the stderr
    // fallback, onError is not rate-limited: the hook owns its own policy).
    logToTransports({
      data: { message: 'ignored again' },
      level: 'INFO',
      options,
      request,
      store
    })
    expect(onError).toHaveBeenCalledTimes(2)
  })
})
