import { describe, expect, test } from 'bun:test'

import {
  createBatchQueue,
  defaultBody,
  flattenMeta,
  getPath,
  type LogEntry,
  postWithRetry,
  stripTrailingSlashes
} from '../../src/adapters/shared'
import { stubFetch } from './helpers'

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

describe('postWithRetry', () => {
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
    const queue = createBatchQueue({
      flushIntervalMs: 10,
      maxBatchSize: 10,
      name: 'Test',
      send: entries => {
        batches.push(entries)
        return Promise.resolve()
      }
    })

    queue.push(entry())
    await new Promise(resolve => {
      setTimeout(resolve, 50)
    })
    expect(batches).toHaveLength(1)
  })
})
