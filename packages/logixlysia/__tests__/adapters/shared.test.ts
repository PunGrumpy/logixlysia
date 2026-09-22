import { describe, expect, mock, test } from 'bun:test'
import {
  createBatchQueue,
  defaultBody,
  flattenMeta,
  getPath,
  postWithRetry,
  resolveEndpoint,
  resolveRetryDelay,
  stripTrailingSlashes
} from '../../src/adapters/shared'
import type { LogEntry } from '../../src/adapters/shared'
import { spyConsole } from '../_helpers/console'
import { stubFetch } from './helpers'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

/** A promise a test resolves by hand, to stand in for a slow send. */
const deferred = (): Deferred => {
  let resolve: () => void = () => {}
  const promise = new Promise<void>(res => {
    resolve = () => res()
  })
  return { promise, resolve }
}

/** Lets pending promise callbacks and the 5 ms flush timer run. */
const settle = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 10)
  })

const entry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  level: 'INFO',
  message: 'hello',
  meta: {},
  timestamp: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides
})

describe('flattenMeta', () => {
  test('flattens nested objects into dot-notation keys', () => {
    const flat = flattenMeta({
      context: { requestId: 'abc', user: { id: 7 } },
      durationMs: 1.5,
      request: { method: 'GET', url: 'http://x/y' },
      status: 200
    })
    expect(flat).toEqual({
      'context.requestId': 'abc',
      'context.user.id': 7,
      durationMs: 1.5,
      'request.method': 'GET',
      'request.url': 'http://x/y',
      status: 200
    })
  })

  test('stringifies arrays and objects beyond the depth limit', () => {
    const flat = flattenMeta({
      a: { b: { c: { d: { e: 1 } } } },
      tags: ['x', 'y']
    })
    expect(flat['a.b.c']).toBe('{"d":{"e":1}}')
    expect(flat.tags).toBe('["x","y"]')
  })

  test('skips null and undefined values', () => {
    expect(flattenMeta({ a: null, b: undefined, c: 0 })).toEqual({ c: 0 })
  })
})

describe('getPath', () => {
  test('resolves dot-notation paths', () => {
    expect(getPath({ context: { userId: 'u1' } }, 'context.userId')).toBe('u1')
  })

  test('returns undefined for missing segments', () => {
    expect(getPath({ context: 'oops' }, 'context.userId')).toBeUndefined()
  })
})

describe('defaultBody', () => {
  test('prefers the log message', () => {
    expect(defaultBody(entry({ message: 'custom' }))).toBe('custom')
  })

  test('falls back to method and path for access logs', () => {
    const accessLog = entry({
      message: '',
      meta: { request: { method: 'GET', url: 'http://localhost/users?q=1' } }
    })
    expect(defaultBody(accessLog)).toBe('GET /users')
  })

  test('falls back to the level when nothing else is available', () => {
    expect(defaultBody(entry({ message: '' }))).toBe('INFO')
  })
})

describe('stripTrailingSlashes', () => {
  test('removes trailing slashes only', () => {
    expect(stripTrailingSlashes('https://api.example.com///')).toBe(
      'https://api.example.com'
    )
    expect(stripTrailingSlashes('https://api.example.com')).toBe(
      'https://api.example.com'
    )
  })
})

describe('resolveEndpoint', () => {
  test('returns a well-formed URL unchanged', () => {
    expect(resolveEndpoint('Test', 'https://a.example/v1/x')).toBe(
      'https://a.example/v1/x'
    )
  })

  test('throws with the adapter name for an unparsable URL', () => {
    expect(() => resolveEndpoint('Test', 'not a url')).toThrow(
      "[logixlysia] Test transport: invalid endpoint URL 'not a url'"
    )
  })

  test('throws for a non-http(s) protocol', () => {
    expect(() => resolveEndpoint('Test', 'ftp://a.example/x')).toThrow(
      'http or https'
    )
  })
})

describe('postWithRetry', () => {
  test('sends ingest requests with redirect: error', async () => {
    const stub = stubFetch([{ status: 200 }])
    try {
      await postWithRetry({
        body: '{}',
        headers: {},
        name: 'Test',
        retries: 2,
        timeout: 1000,
        url: 'https://example.com/ingest'
      })
      expect(stub.calls[0]?.redirect).toBe('error')
    } finally {
      stub.restore()
    }
  })

  test('retries 5xx responses and succeeds', async () => {
    const stub = stubFetch([{ status: 500 }, { status: 200 }])
    try {
      await postWithRetry({
        body: '{}',
        headers: {},
        name: 'Test',
        retries: 2,
        timeout: 1000,
        url: 'https://example.com/ingest'
      })
      expect(stub.calls).toHaveLength(2)
    } finally {
      stub.restore()
    }
  })

  test('does not retry non-retryable 4xx responses', async () => {
    const stub = stubFetch([{ body: 'bad key', status: 401 }])
    try {
      await expect(
        postWithRetry({
          body: '{}',
          headers: {},
          name: 'Test',
          retries: 2,
          timeout: 1000,
          url: 'https://example.com/ingest'
        })
      ).rejects.toThrow('HTTP 401')
      expect(stub.calls).toHaveLength(1)
    } finally {
      stub.restore()
    }
  })

  test('honors Retry-After on 429', async () => {
    const stub = stubFetch([
      { headers: { 'retry-after': '1' }, status: 429 },
      { status: 200 }
    ])
    const startedAt = performance.now()
    try {
      await postWithRetry({
        body: '{}',
        headers: {},
        name: 'Test',
        retries: 2,
        timeout: 1000,
        url: 'https://example.com/ingest'
      })
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(900)
      expect(stub.calls).toHaveLength(2)
    } finally {
      stub.restore()
    }
  })

  test('wraps a non-Error rejection with cause', async () => {
    const stub = stubFetch([{ reject: 'boom' }])
    try {
      await expect(
        postWithRetry({
          body: '{}',
          headers: {},
          name: 'Test',
          retries: 0,
          timeout: 1000,
          url: 'https://example.com/ingest'
        })
      ).rejects.toMatchObject({ cause: 'boom' })
      expect(stub.calls).toHaveLength(1)
    } finally {
      stub.restore()
    }
  })

  test('retries after an aborted request', async () => {
    const stub = stubFetch([
      { reject: new DOMException('aborted', 'AbortError') },
      { status: 200 }
    ])
    try {
      await postWithRetry({
        body: '{}',
        headers: {},
        name: 'Test',
        retries: 2,
        timeout: 1000,
        url: 'https://example.com/ingest'
      })
      expect(stub.calls).toHaveLength(2)
    } finally {
      stub.restore()
    }
  })

  test('throws the last error once retries are exhausted', async () => {
    const stub = stubFetch([{ status: 503 }])
    try {
      await expect(
        postWithRetry({
          body: '{}',
          headers: {},
          name: 'Test',
          retries: 1,
          timeout: 1000,
          url: 'https://example.com/ingest'
        })
      ).rejects.toThrow('HTTP 503')
      expect(stub.calls).toHaveLength(2)
    } finally {
      stub.restore()
    }
  })

  test('sanitizes escape sequences out of the response body preview', async () => {
    const stub = stubFetch([{ body: 'x\u001B[31my', status: 500 }])
    try {
      const rejection = await postWithRetry({
        body: '{}',
        headers: {},
        name: 'Test',
        retries: 0,
        timeout: 1000,
        url: 'https://example.com/ingest'
      }).catch((error: Error) => error)
      expect(rejection).toBeInstanceOf(Error)
      expect((rejection as Error).message).not.toContain('\u001B')
    } finally {
      stub.restore()
    }
  })
})

describe('resolveRetryDelay', () => {
  const response = (retryAfter: string): Response =>
    new Response(null, {
      headers: { 'retry-after': retryAfter },
      status: 429
    })

  test('caps a long Retry-After at 30 seconds', () => {
    expect(resolveRetryDelay(response('3600'), 0)).toBe(30_000)
  })

  test('accepts an HTTP-date Retry-After', () => {
    // An HTTP-date only carries whole seconds, so the delay lands just under.
    const fiveSecondsAhead = new Date(Date.now() + 5000).toUTCString()
    const delay = resolveRetryDelay(response(fiveSecondsAhead), 0)
    expect(delay).toBeGreaterThan(3900)
    expect(delay).toBeLessThanOrEqual(5000)
  })

  test('falls back to jittered linear backoff for an unparsable value', () => {
    const delay = resolveRetryDelay(response('abc'), 0)
    expect(delay).toBeGreaterThanOrEqual(125)
    expect(delay).toBeLessThanOrEqual(375)
  })

  test('falls back to jittered linear backoff without a response', () => {
    const delay = resolveRetryDelay(undefined, 1)
    expect(delay).toBeGreaterThanOrEqual(250)
    expect(delay).toBeLessThanOrEqual(750)
  })
})

describe('createBatchQueue', () => {
  test('flushes immediately when maxBatchSize is reached', async () => {
    const batches: LogEntry[][] = []
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        return Promise.resolve()
      }
    })

    expect(queue.push(entry())).toBeUndefined()
    await queue.push(entry())
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(2)
  })

  test('flush() sends buffered entries and is a no-op when empty', async () => {
    const batches: LogEntry[][] = []
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 10,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        return Promise.resolve()
      }
    })

    queue.push(entry())
    await queue.flush()
    await queue.flush()
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(1)
  })

  test('flushes on the interval timer', async () => {
    const batches: LogEntry[][] = []
    const sent = deferred()
    const queue = createBatchQueue({
      flushIntervalMs: 5,
      maxBatchSize: 10,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        sent.resolve()
        return Promise.resolve()
      }
    })

    queue.push(entry())
    await sent.promise
    expect(batches).toHaveLength(1)
  })

  test('delivers batches in order when a send is slow', async () => {
    const batches: LogEntry[][] = []
    const slow = deferred()
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        return batches.length === 1 ? slow.promise : Promise.resolve()
      }
    })

    for (const message of ['a', 'b', 'c', 'd']) {
      queue.push(entry({ message }))
    }

    await Promise.resolve()
    expect(batches).toHaveLength(1)

    slow.resolve()
    await queue.flush()

    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
  })

  test('flush() waits for a send that was already in flight', async () => {
    const slow = deferred()
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      name: 'Test',
      send: () => slow.promise
    })

    queue.push(entry())
    let flushed = false
    const flushing = queue.flush().then(() => {
      flushed = true
    })

    await Promise.resolve()
    expect(flushed).toBe(false)

    slow.resolve()
    await flushing
    expect(flushed).toBe(true)
  })

  test('drops batches beyond maxPendingBatches and reports them', async () => {
    const stuck = deferred()
    const onError = mock((_error: unknown) => {})
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      maxPendingBatches: 1,
      name: 'Test',
      onError,
      send: () => stuck.promise
    })

    for (const message of ['a', 'dropped-1', 'dropped-2']) {
      queue.push(entry({ message }))
    }

    expect(onError).toHaveBeenCalledTimes(2)
    const [reported] = onError.mock.calls[0] ?? []
    expect(String(reported)).toContain('dropped')

    stuck.resolve()
    await queue.flush()
  })

  test('timer flush failure calls onError', async () => {
    const onError = mock((_error: unknown) => {})
    const console = spyConsole(['error'])
    const queue = createBatchQueue({
      flushIntervalMs: 5,
      maxBatchSize: 10,
      name: 'Test',
      onError,
      send: () => Promise.reject(new Error('boom'))
    })

    try {
      queue.push(entry())
      await settle()

      expect(onError).toHaveBeenCalledTimes(1)
      expect(console.spies.error).not.toHaveBeenCalled()
    } finally {
      console.restore()
    }
  })

  test('timer flush failure without onError logs to stderr once', async () => {
    const console = spyConsole(['error'])
    const queue = createBatchQueue({
      flushIntervalMs: 5,
      maxBatchSize: 10,
      name: 'Test',
      send: () => Promise.reject(new Error('boom'))
    })

    try {
      queue.push(entry())
      await settle()
      queue.push(entry())
      await settle()

      expect(console.spies.error).toHaveBeenCalledTimes(1)
    } finally {
      console.restore()
    }
  })

  test('a failed send does not block later sends', async () => {
    const batches: LogEntry[][] = []
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        return batches.length === 1
          ? Promise.reject(new Error('boom'))
          : Promise.resolve()
      }
    })

    await expect(queue.push(entry({ message: 'a' }))).rejects.toThrow('boom')
    await queue.push(entry({ message: 'b' }))
    await queue.flush()

    expect(batches.map(batch => batch[0]?.message)).toEqual(['a', 'b'])
  })
})
