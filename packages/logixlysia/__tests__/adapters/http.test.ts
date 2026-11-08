import { describe, expect, test } from 'bun:test'
import type { LogEntry, LogLevel } from '../../src/http'
import { createHttpTransport, entryText } from '../../src/http'
import { stubFetch } from './helpers'

const URL = 'http://collector.test/ingest'
const HEADERS = { 'content-type': 'text/plain', 'x-token': 'secret' }

const joinMessages = (entries: LogEntry[]): string =>
  entries.map(entry => entry.message).join('|')

const entry = (
  message: string,
  meta: Record<string, unknown>,
  level: LogLevel = 'INFO'
): LogEntry => ({
  level,
  message,
  meta,
  timestamp: new Date()
})

describe('logixlysia/http', () => {
  test('sends one POST with both entries, the headers and the built body', async () => {
    const stub = stubFetch()
    try {
      const transport = createHttpTransport({
        body: joinMessages,
        headers: HEADERS,
        name: 'custom',
        options: {},
        url: URL
      })
      transport.log('INFO', 'first', {})
      transport.log('ERROR', 'second', {})
      await transport.flush()

      expect(stub.calls).toHaveLength(1)
      expect(stub.calls[0]).toMatchObject({
        body: 'first|second',
        headers: HEADERS,
        method: 'POST',
        url: URL
      })
    } finally {
      stub.restore()
    }
  })

  test('retries a 503 and delivers the batch once', async () => {
    const stub = stubFetch([{ status: 503 }, { status: 200 }])
    try {
      const transport = createHttpTransport({
        body: joinMessages,
        headers: HEADERS,
        name: 'custom',
        options: {},
        url: URL
      })
      transport.log('INFO', 'only', {})
      await transport.flush()

      expect(stub.calls.map(call => call.body)).toEqual(['only', 'only'])
    } finally {
      stub.restore()
    }
  })

  test('passes options through to the queue and the transport', async () => {
    const stub = stubFetch([{ status: 500 }])
    try {
      const dropped: { count: number; reason: string }[] = []
      const transport = createHttpTransport({
        body: joinMessages,
        headers: HEADERS,
        name: 'custom',
        options: {
          minLevel: 'WARNING',
          onDropped: info => dropped.push(info),
          retries: 0
        },
        url: URL
      })
      transport.log('ERROR', 'lost', {})

      await expect(transport.flush()).rejects.toThrow('HTTP 500')
      expect(dropped).toEqual([{ count: 1, reason: 'send-failed' }])
      expect(transport.minLevel).toBe('WARNING')
    } finally {
      stub.restore()
    }
  })

  test('entryText names an access line by method and path', () => {
    expect(entryText(entry('hello', {}))).toBe('hello')
    expect(
      entryText(
        entry('', { request: { method: 'POST', url: 'http://host/x?a=1' } })
      )
    ).toBe('POST /x')
  })

  test('a throwing body reports send-failed and never throws from log', async () => {
    const stub = stubFetch()
    try {
      const dropped: { count: number; reason: string }[] = []
      const transport = createHttpTransport({
        body: () => {
          throw new Error('cannot serialize')
        },
        headers: HEADERS,
        name: 'custom',
        options: { onDropped: info => dropped.push(info) },
        url: URL
      })

      expect(() => transport.log('INFO', 'x', {})).not.toThrow()
      await expect(transport.flush()).rejects.toThrow('cannot serialize')
      expect(dropped).toEqual([{ count: 1, reason: 'send-failed' }])
      expect(stub.calls).toHaveLength(0)
    } finally {
      stub.restore()
    }
  })
})

const heldFetch = () => {
  const bodies: string[] = []
  const { promise: gate, resolve: release }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body))
    await gate
    return new Response('ok')
  }) as typeof fetch
  return {
    bodies,
    release,
    restore: () => {
      globalThis.fetch = original
    }
  }
}

const gatedFetch = (count: number) => {
  const bodies: string[] = []
  const gates = Array.from({ length: count }, (): PromiseWithResolvers<void> =>
    Promise.withResolvers()
  )
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const gate = gates[calls]
    calls += 1
    bodies.push(String(init?.body))
    await gate?.promise
    return new Response('ok')
  }) as typeof fetch
  return {
    bodies,
    release: (index: number): void => {
      gates[index]?.resolve()
    },
    restore: () => {
      globalThis.fetch = original
    }
  }
}

const FLUSH_TIMEOUT_MS = 2000

type LogFn = (level: LogLevel, message: string) => void

/**
 * Holds a send in flight, fills the queue behind it (bound: 4 entries), runs
 * `burst`, then lets the send finish and flushes.
 */
const withFullQueue = async (burst: (log: LogFn) => void) => {
  const held = heldFetch()
  try {
    const dropped: { count: number; reason: string }[] = []
    const transport = createHttpTransport({
      body: entries =>
        entries.map(item => `${item.level}:${item.message}`).join(','),
      headers: HEADERS,
      name: 'custom',
      options: {
        flushIntervalMs: 60_000,
        maxBatchSize: 2,
        maxPendingBatches: 2,
        onDropped: info => dropped.push(info),
        onError: () => {}
      },
      url: URL
    })
    transport.log('INFO', 'a', {})
    transport.log('INFO', 'b', {})
    await Bun.sleep(5)
    burst((level, message) => transport.log(level, message, {}))
    held.release()
    const flushed = await Promise.race([
      transport.flush().then(() => true),
      Bun.sleep(FLUSH_TIMEOUT_MS).then(() => false)
    ])
    return { bodies: held.bodies, dropped, flushed }
  } finally {
    held.restore()
  }
}

describe('a full queue', () => {
  test('an ERROR arriving at a full DEBUG queue takes the oldest DEBUG place', async () => {
    const { bodies, dropped } = await withFullQueue(log => {
      for (const message of ['d1', 'd2', 'd3', 'd4']) {
        log('DEBUG', message)
      }
      log('ERROR', 'the outage')
    })

    const sent = bodies.join('|')
    expect(sent).toContain('ERROR:the outage')
    expect(sent).not.toContain('DEBUG:d1')
    expect(sent.indexOf('DEBUG:d2')).toBeLessThan(
      sent.indexOf('ERROR:the outage')
    )
    expect(dropped).toEqual([{ count: 1, reason: 'queue-full' }])
  })

  test('a full ERROR queue drops the newcomer', async () => {
    const { bodies, dropped } = await withFullQueue(log => {
      for (const message of ['e1', 'e2', 'e3', 'e4']) {
        log('ERROR', message)
      }
      log('WARNING', 'late')
    })

    expect(bodies.join('|')).not.toContain('late')
    expect(dropped).toEqual([{ count: 1, reason: 'queue-full' }])
  })

  test('flush resolves after an eviction and sends no empty batch', async () => {
    const { bodies, flushed } = await withFullQueue(log => {
      for (const message of ['d1', 'd2', 'd3', 'd4']) {
        log('DEBUG', message)
      }
      log('ERROR', 'the outage')
    })

    expect(flushed).toBe(true)
    expect(bodies.every(body => body.length > 0)).toBe(true)
    expect(bodies.join(',').split(',')).toHaveLength(6)
  })

  test('flush keeps waiting for earlier entries when louder ones evict quieter ones', async () => {
    const gated = gatedFetch(2)
    try {
      const transport = createHttpTransport({
        body: entries =>
          entries.map(item => `${item.level}:${item.message}`).join(','),
        headers: HEADERS,
        name: 'custom',
        options: {
          flushIntervalMs: 60_000,
          maxBatchSize: 2,
          maxPendingBatches: 2,
          onError: () => {}
        },
        url: URL
      })
      const log: LogFn = (level, message) => {
        transport.log(level, message, {})
      }

      log('INFO', 'a')
      log('INFO', 'b')
      await Bun.sleep(5)
      for (const message of ['e1', 'e2', 'e3']) {
        log('ERROR', message)
      }
      const flushed = transport.flush()
      log('DEBUG', 'd')
      log('INFO', 'i')
      log('WARNING', 'w')
      log('ERROR', 'e4')
      gated.release(0)

      const early = await Promise.race([
        flushed.then(() => 'flushed'),
        Bun.sleep(50).then(() => 'pending')
      ])
      expect(early).toBe('pending')

      gated.release(1)
      await flushed
      expect(gated.bodies).toHaveLength(2)
      for (const expected of ['e1', 'e2', 'e3', 'e4']) {
        expect(gated.bodies[1]).toContain(`ERROR:${expected}`)
      }
      expect(gated.bodies.join(',').split(',')).toHaveLength(6)
    } finally {
      gated.restore()
    }
  })

  test('flush sends every entry that was not dropped after several evictions', async () => {
    const { bodies, dropped, flushed } = await withFullQueue(log => {
      for (const message of ['d1', 'd2', 'd3', 'd4']) {
        log('DEBUG', message)
      }
      for (const message of ['e1', 'e2', 'e3', 'e4', 'e5']) {
        log('ERROR', message)
      }
    })

    const logged = 2 + 4 + 5
    let lost = 0
    for (const info of dropped) {
      lost += info.count
    }
    expect(flushed).toBe(true)
    expect(bodies.every(body => body.length > 0)).toBe(true)
    expect(bodies.join(',').split(',')).toHaveLength(logged - lost)
  })

  test('a same-level newcomer is dropped as before', async () => {
    const { bodies, dropped } = await withFullQueue(log => {
      for (const message of ['i1', 'i2', 'i3', 'i4', 'i5']) {
        log('INFO', message)
      }
    })

    expect(bodies.join('|')).not.toContain('i5')
    expect(dropped).toEqual([{ count: 1, reason: 'queue-full' }])
  })
})
