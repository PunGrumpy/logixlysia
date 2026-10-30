import { describe, expect, mock, setSystemTime, test } from 'bun:test'
import type { Options } from '../../src/interfaces'
import { logToTransports } from '../../src/output'
import { spyConsole } from '../_helpers/console'
import { precomputedFor } from '../_helpers/precomputed'
import { createMockRequest } from '../_helpers/request'
import { sleep } from '../_helpers/sleep'

const urlSeenByTransport = (
  url: string,
  config?: { logQueryParams?: boolean }
): unknown => {
  const transport = mock<
    (lvl: unknown, msg: unknown, metaArg?: unknown) => void
  >(() => {})
  const options: Options = {
    config: { ...config, transports: [{ log: transport }] }
  }
  const request = createMockRequest(url)

  logToTransports({
    data: { message: 'Test message' },
    level: 'INFO',
    options,
    precomputed: precomputedFor(request),
    request,
    store: { beforeTime: 0n }
  })

  const meta = transport.mock.calls[0]?.[2] as Record<string, unknown>
  return (meta.request as { url?: unknown }).url
}

describe('logToTransports', () => {
  test('calls all transports with level/message/meta', () => {
    const t1 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {}
    )
    const t2 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {}
    )

    const options: Options = {
      config: {
        transports: [{ log: t1 }, { log: t2 }]
      }
    }

    const request = createMockRequest('http://localhost/hello')
    const store = { beforeTime: 0n }

    logToTransports({
      data: { message: 'Test message', status: 200 },
      level: 'INFO',
      options,
      precomputed: precomputedFor(request),
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

  test('reports the precomputed durationMs to transports', () => {
    const t1 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {}
    )
    const options: Options = { config: { transports: [{ log: t1 }] } }
    const request = createMockRequest('http://localhost/hello')
    const store = { beforeTime: 0n }

    logToTransports({
      data: { message: 'Test message' },
      level: 'INFO',
      options,
      precomputed: precomputedFor(request, 12.34),
      request,
      store
    })

    const meta = t1.mock.calls[0]?.[2] as Record<string, unknown>
    expect(meta.durationMs).toBe(12.34)

    const t2 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {}
    )
    const zeroOptions: Options = { config: { transports: [{ log: t2 }] } }
    const zeroStore = { beforeTime: 0n }

    logToTransports({
      data: { message: 'Test message' },
      level: 'INFO',
      options: zeroOptions,
      precomputed: precomputedFor(request),
      request,
      store: zeroStore
    })

    const zeroMeta = t2.mock.calls[0]?.[2] as Record<string, unknown>
    expect(zeroMeta.durationMs).toBe(0)
  })

  test('reports a throwing transport to stderr, rate-limited', () => {
    const { spies, restore } = spyConsole(['error'])
    setSystemTime(new Date(Date.now() + 6000))

    try {
      const throwing = mock<
        (lvl: unknown, msg: unknown, metaArg?: unknown) => void
      >(() => {
        throw new Error('boom')
      })

      const options: Options = { config: { transports: [{ log: throwing }] } }
      const request = createMockRequest('http://localhost/throw')
      const store = { beforeTime: 0n }

      logToTransports({
        data: { message: 'ignored' },
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store
      })

      expect(spies.error).toHaveBeenCalledTimes(1)
      const [firstErrorCall] = spies.error.mock.calls
      expect(firstErrorCall?.[0]).toContain('transport failed')

      logToTransports({
        data: { message: 'ignored again' },
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store
      })

      expect(spies.error).toHaveBeenCalledTimes(1)
    } finally {
      setSystemTime()
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
    const store = { beforeTime: 0n }

    expect(() => {
      logToTransports({
        data: { message: 'ignored' },
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
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
    const store = { beforeTime: 0n }

    logToTransports({
      data: { message: 'async' },
      level: 'INFO',
      options,
      precomputed: precomputedFor(request),
      request,
      store
    })

    await sleep(0)

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
    const store = { beforeTime: 0n }

    expect(() => {
      logToTransports({
        data: { message: 'ignored' },
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
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

    logToTransports({
      data: { message: 'ignored again' },
      level: 'INFO',
      options,
      precomputed: precomputedFor(request),
      request,
      store
    })
    expect(onError).toHaveBeenCalledTimes(2)
  })

  test('strips the query string and fragment from request.url by default', () => {
    expect(
      urlSeenByTransport('http://localhost/login?code=abc&state=xyz#frag')
    ).toBe('http://localhost/login')
  })

  test('keeps the query string when logQueryParams is true', () => {
    expect(
      urlSeenByTransport('http://localhost/login?code=abc&state=xyz', {
        logQueryParams: true
      })
    ).toBe('http://localhost/login?code=abc&state=xyz')
  })

  test('leaves a URL without a query string untouched', () => {
    const request = createMockRequest('http://localhost/hello')
    expect(urlSeenByTransport(request.url)).toBe(request.url)
    expect(urlSeenByTransport(request.url)).toBe('http://localhost/hello')
  })
})
