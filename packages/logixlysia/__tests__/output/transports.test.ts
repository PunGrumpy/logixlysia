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
      level: 'INFO',
      request,
      data: { message: 'Test message', status: 200 },
      store,
      options
    })

    expect(t1).toHaveBeenCalledTimes(1)
    expect(t2).toHaveBeenCalledTimes(1)

    const firstCall = t1.mock.calls[0]
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
      level: 'INFO',
      request,
      data: { message: 'Test message' },
      store,
      options
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
      level: 'INFO',
      request,
      data: { message: 'Test message' },
      store: zeroStore,
      options: zeroOptions
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
        level: 'INFO',
        request,
        data: { message: 'ignored' },
        store,
        options
      })

      expect(spies.error).toHaveBeenCalledTimes(1)
      const firstErrorCall = spies.error.mock.calls[0]
      expect(firstErrorCall?.[0]).toContain('transport failed')

      // A second immediate failure must not log again (rate limit).
      logToTransports({
        level: 'INFO',
        request,
        data: { message: 'ignored again' },
        store,
        options
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
        level: 'INFO',
        request,
        data: { message: 'ignored' },
        store,
        options
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
      level: 'INFO',
      request,
      data: { message: 'async' },
      store,
      options
    })

    // Let promise microtasks run; rejections should be caught internally.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(rejecting).toHaveBeenCalledTimes(1)
  })
})
