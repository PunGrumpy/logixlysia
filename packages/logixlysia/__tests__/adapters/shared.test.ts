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
import { sleep } from '../_helpers/sleep'
import { stubFetch } from './helpers'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

/** A promise a test resolves by hand, to stand in for a slow send. */
const deferred = (): Deferred => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  return { promise, resolve }
}

/** Lets pending promise callbacks and the 5 ms flush timer run. */
const settle = (): Promise<void> => sleep(10)

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

const retryAfterResponse = (retryAfter: string): Response =>
  new Response(null, {
    headers: { 'retry-after': retryAfter },
    status: 429
  })

describe('resolveRetryDelay', () => {
  test('caps a long Retry-After at 30 seconds', () => {
    expect(resolveRetryDelay(retryAfterResponse('3600'), 0)).toBe(30_000)
  })

  test('accepts an HTTP-date Retry-After', () => {
    // An HTTP-date only carries whole seconds, so the delay lands just under.
    const fiveSecondsAhead = new Date(Date.now() + 5000).toUTCString()
    const delay = resolveRetryDelay(retryAfterResponse(fiveSecondsAhead), 0)
    expect(delay).toBeGreaterThan(3900)
    expect(delay).toBeLessThanOrEqual(5000)
  })

  test('falls back to jittered linear backoff for an unparsable value', () => {
    const delay = resolveRetryDelay(retryAfterResponse('abc'), 0)
    expect(delay).toBeGreaterThanOrEqual(125)
    expect(delay).toBeLessThanOrEqual(375)
  })

  test('falls back to jittered linear backoff without a response', () => {
    const delay = resolveRetryDelay(undefined, 1)
    expect(delay).toBeGreaterThanOrEqual(250)
    expect(delay).toBeLessThanOrEqual(750)
  })

  test.each([
    ['5', 5000],
    [' 5 ', 5000],
    ['0', 0]
  ])('reads the delta-seconds Retry-After %j as %p ms', (retryAfter, ms) => {
    expect(resolveRetryDelay(retryAfterResponse(retryAfter), 0)).toBe(ms)
  })

  // `1e3` and `0x10` are not `delta-seconds`, and `Date.parse` reads `+5` and
  // `5.5` as dates in 2001. Reading any of them as a delay would replace the
  // backoff with a wait the server never asked for, or with none at all.
  test.each(['1e3', '0x10', '+5', '5.5'])(
    'ignores the non-conforming Retry-After %j and backs off instead',
    retryAfter => {
      const delay = resolveRetryDelay(retryAfterResponse(retryAfter), 0)
      expect(delay).toBeGreaterThanOrEqual(125)
      expect(delay).toBeLessThanOrEqual(375)
    }
  )

  test('ignores an HTTP-date Retry-After that already passed', () => {
    const anHourAgo = new Date(Date.now() - 3_600_000).toUTCString()
    const delay = resolveRetryDelay(retryAfterResponse(anHourAgo), 0)
    expect(delay).toBeGreaterThanOrEqual(125)
    expect(delay).toBeLessThanOrEqual(375)
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

  test('sends entries that arrive during a slow send together in the next request', async () => {
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

    for (const message of ['a', 'b', 'c', 'd', 'e', 'f']) {
      queue.push(entry({ message }))
    }

    await Promise.resolve()
    expect(batches).toHaveLength(1)

    slow.resolve()
    await queue.flush()

    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a', 'b'],
      ['c', 'd', 'e', 'f']
    ])
  })

  test('caps a coalesced request at maxEntriesPerRequest and keeps order', async () => {
    const batches: LogEntry[][] = []
    const slow = deferred()
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      maxEntriesPerRequest: 3,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        return batches.length === 1 ? slow.promise : Promise.resolve()
      }
    })

    for (const message of ['a', 'b', 'c', 'd', 'e', 'f']) {
      queue.push(entry({ message }))
    }

    await Promise.resolve()
    expect(batches).toHaveLength(1)

    slow.resolve()
    await queue.flush()

    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a', 'b'],
      ['c', 'd', 'e'],
      ['f']
    ])
  })

  test('starts the next request on its own only for a full batch', async () => {
    const batches: LogEntry[][] = []
    const sends: Deferred[] = []
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        const next = deferred()
        sends.push(next)
        return next.promise
      }
    })

    queue.push(entry({ message: 'a' }))
    const first = queue.push(entry({ message: 'b' }))
    queue.push(entry({ message: 'c' }))
    await Promise.resolve()
    sends[0]?.resolve()
    await first

    expect(batches).toHaveLength(1)

    const second = queue.flush()
    await Promise.resolve()
    queue.push(entry({ message: 'd' }))
    queue.push(entry({ message: 'e' }))
    sends[1]?.resolve()
    await second

    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a', 'b'],
      ['c'],
      ['d', 'e']
    ])

    sends[2]?.resolve()
    await queue.flush()
  })

  test('an entry left over after a capped request goes out on the timer', async () => {
    const batches: LogEntry[][] = []
    const slow = deferred()
    const queue = createBatchQueue({
      flushIntervalMs: 5,
      maxBatchSize: 2,
      maxEntriesPerRequest: 2,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        return batches.length === 1 ? slow.promise : Promise.resolve()
      }
    })

    for (const message of ['a', 'b', 'c', 'd']) {
      queue.push(entry({ message }))
    }
    // Clears the timer, as the timer firing would, so `e` lands in a full
    // batch with no timer armed.
    const flushing = queue.flush()
    queue.push(entry({ message: 'e' }))
    slow.resolve()
    await flushing

    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])

    await settle()

    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e']
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

  test('flush() resolves once the entries pushed before it have settled, even while more arrive', async () => {
    const batches: LogEntry[][] = []
    const sends: Deferred[] = []
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        const next = deferred()
        sends.push(next)
        return next.promise
      }
    })

    queue.push(entry({ message: 'a' }))
    await Promise.resolve()
    let flushed = false
    const flushing = queue.flush().then(() => {
      flushed = true
    })
    queue.push(entry({ message: 'b' }))
    sends[0]?.resolve()
    await settle()

    expect(flushed).toBe(true)
    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a'],
      ['b']
    ])
    expect(sends).toHaveLength(2)

    sends[1]?.resolve()
    await flushing
    await queue.flush()
  })

  test('drops entries beyond the waiting bound and reports once per send', async () => {
    const batches: LogEntry[][] = []
    const stuck = deferred()
    const onError = mock((_error: unknown) => {})
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      maxPendingBatches: 2,
      name: 'Test',
      onError,
      send: entries => {
        batches.push(entries)
        return stuck.promise
      }
    })

    for (const message of ['a', 'b', 'c', 'd', 'e']) {
      queue.push(entry({ message }))
    }

    expect(onError).not.toHaveBeenCalled()

    stuck.resolve()
    await queue.flush()

    expect(onError).toHaveBeenCalledTimes(1)
    const [reported] = onError.mock.calls[0] ?? []
    expect(String(reported)).toContain('2 entries dropped')
    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a'],
      ['b', 'c']
    ])
  })

  test('reports entries dropped while onError handles an earlier drop', async () => {
    const reports: string[] = []
    const slow = deferred()
    let sends = 0
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      maxEntriesPerRequest: 1,
      maxPendingBatches: 2,
      name: 'Test',
      onError: error => {
        reports.push(String(error))
        if (reports.length === 1) {
          for (const message of ['x', 'y', 'z']) {
            queue.push(entry({ message }))
          }
        }
      },
      send: () => {
        sends += 1
        return sends === 1 ? slow.promise : Promise.resolve()
      }
    })

    for (const message of ['a', 'b', 'c', 'd', 'e']) {
      queue.push(entry({ message }))
    }
    slow.resolve()
    await queue.flush()
    await queue.flush()

    expect(reports).toEqual([
      'Error: [logixlysia] Test transport: 2 entries dropped while 2 were already waiting',
      'Error: [logixlysia] Test transport: 2 entries dropped while 2 were already waiting'
    ])
  })

  test('an onError that logs a drop through the queue never overlaps requests', async () => {
    let active = 0
    let maxActive = 0
    const sent: string[] = []
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      maxPendingBatches: 1,
      name: 'Test',
      onError: () => {
        queue.push(entry({ message: 'drop reported' }))
      },
      send: async entries => {
        active += 1
        maxActive = Math.max(maxActive, active)
        sent.push(...entries.map(item => item.message))
        await Promise.resolve()
        active -= 1
      }
    })

    for (const message of ['a', 'b', 'c', 'd']) {
      queue.push(entry({ message }))
    }
    await queue.flush()
    await queue.flush()

    expect(maxActive).toBe(1)
    expect(sent).toEqual(['a', 'b', 'drop reported'])
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

  test('sends the entries waiting behind a failed request without a flush', async () => {
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

    const pushA = queue.push(entry({ message: 'a' }))
    queue.push(entry({ message: 'b' }))
    queue.push(entry({ message: 'c' }))
    await expect(pushA).rejects.toThrow('boom')

    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a'],
      ['b', 'c']
    ])
  })

  test('a send that throws synchronously rejects its push and the queue keeps sending', async () => {
    let calls = 0
    const sent: string[] = []
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      name: 'Test',
      send: entries => {
        calls += 1
        if (calls === 1) {
          throw new Error('body failed')
        }
        sent.push(...entries.map(item => item.message))
        return Promise.resolve()
      }
    })

    await expect(queue.push(entry({ message: 'a' }))).rejects.toThrow(
      'body failed'
    )
    await queue.push(entry({ message: 'b' }))

    expect(sent).toEqual(['b'])
  })

  test('reports the failure of a request the queue started on its own', async () => {
    const batches: LogEntry[][] = []
    const slow = deferred()
    const onError = mock((_error: unknown) => {})
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 1,
      name: 'Test',
      onError,
      send: entries => {
        batches.push(entries)
        return batches.length === 1
          ? slow.promise
          : Promise.reject(new Error('boom'))
      }
    })

    queue.push(entry({ message: 'a' }))
    queue.push(entry({ message: 'b' }))
    slow.resolve()
    await queue.flush()

    expect(onError).toHaveBeenCalledTimes(1)
    const [reported] = onError.mock.calls[0] ?? []
    expect(String(reported)).toContain('boom')
    expect(batches.map(batch => batch.map(item => item.message))).toEqual([
      ['a'],
      ['b']
    ])
  })

  test('an entry that onError logs after a failed request waits for a full batch or a flush', async () => {
    const batches: string[][] = []
    let failures = 0
    const queue = createBatchQueue({
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      name: 'Test',
      onError: () => {
        failures += 1
        // Logs only the first failure, so that a queue which starts a
        // request per failure fails this test instead of looping forever.
        if (failures === 1) {
          queue.push(entry({ message: 'failure logged' }))
        }
      },
      send: entries => {
        batches.push(entries.map(item => item.message))
        return Promise.reject(new Error('down'))
      }
    })

    queue.push(entry({ message: 'a' }))
    const first = queue.push(entry({ message: 'b' }))
    queue.push(entry({ message: 'c' }))
    queue.push(entry({ message: 'd' }))
    await expect(first).rejects.toThrow('down')

    expect(batches).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
    expect(failures).toBe(1)

    await expect(queue.flush()).rejects.toThrow('down')

    expect(batches).toEqual([['a', 'b'], ['c', 'd'], ['failure logged']])
    expect(failures).toBe(1)
  })
})
