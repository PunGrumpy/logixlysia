import { describe, expect, test } from 'bun:test'
import { createHttpTransport } from '../../src/adapters/shared'
import type { BatchTransportOptions } from '../../src/adapters/shared'
import { waitFor } from '../_helpers/wait-for'
import { stubFetch } from './helpers'

/** The delay a `Retry-After: 30` answer asks for. */
const RETRY_SLEEP_MS = 30_000
const TOO_MANY_REQUESTS = { headers: { 'retry-after': '30' }, status: 429 }
const OK = { status: 200 }

interface WatchedTimer {
  /** Runs the timer's callback now, as if its delay had passed. */
  fire: () => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Records every timer set for `delayMs`, so a test can read whether it holds
 * the process and fire it without waiting.
 */
const watchTimers = (
  delayMs: number
): { restore: () => void; timers: WatchedTimer[] } => {
  const original = globalThis.setTimeout
  const timers: WatchedTimer[] = []
  const watched = (
    handler: () => void,
    ms?: number
  ): ReturnType<typeof setTimeout> => {
    const timer = original(handler, ms)
    if (ms === delayMs) {
      timers.push({
        fire: () => {
          clearTimeout(timer)
          handler()
        },
        timer
      })
    }
    return timer
  }
  globalThis.setTimeout = watched as unknown as typeof setTimeout
  return {
    restore: () => {
      globalThis.setTimeout = original
    },
    timers
  }
}

const transportWith = (options: BatchTransportOptions) =>
  createHttpTransport({
    body: entries => JSON.stringify(entries.map(entry => entry.message)),
    headers: {},
    name: 'Test',
    options: {
      flushIntervalMs: 60_000,
      onError: () => {},
      retries: 1,
      ...options
    },
    url: 'https://ingest.example/v1'
  })

describe('who holds the process during a retry sleep', () => {
  test('a send that a flush() awaits sleeps on a timer that holds the process', async () => {
    const stub = stubFetch([TOO_MANY_REQUESTS, OK])
    const clock = watchTimers(RETRY_SLEEP_MS)
    try {
      const transport = transportWith({})
      transport.log('INFO', 'a')
      const flushing = transport.flush()
      await waitFor(() => clock.timers.length === 1)

      expect(clock.timers[0]?.timer.hasRef()).toBe(true)

      clock.timers[0]?.fire()
      await flushing
      expect(stub.calls).toHaveLength(2)
    } finally {
      clock.restore()
      stub.restore()
    }
  })

  test.each([
    ['a full batch', { maxBatchSize: 1 }],
    ['the interval timer', { flushIntervalMs: 1 }]
  ])(
    'a send started by %s, which nobody awaits, sleeps on a timer that does not hold the process',
    async (_starter, options) => {
      const stub = stubFetch([TOO_MANY_REQUESTS, OK])
      const clock = watchTimers(RETRY_SLEEP_MS)
      try {
        const transport = transportWith(options)
        transport.log('INFO', 'a')
        await waitFor(() => clock.timers.length === 1)

        expect(clock.timers[0]?.timer.hasRef()).toBe(false)

        clock.timers[0]?.fire()
        await transport.flush()
        expect(stub.calls).toHaveLength(2)
      } finally {
        clock.restore()
        stub.restore()
      }
    }
  )

  test('a flush() that starts during that sleep holds it until the flush settles', async () => {
    const stub = stubFetch([TOO_MANY_REQUESTS, OK, TOO_MANY_REQUESTS, OK])
    const clock = watchTimers(RETRY_SLEEP_MS)
    try {
      const transport = transportWith({ maxBatchSize: 1 })
      const first = transport.log('INFO', 'a')
      await waitFor(() => clock.timers.length === 1)

      expect(clock.timers[0]?.timer.hasRef()).toBe(false)
      const flushing = transport.flush()
      expect(clock.timers[0]?.timer.hasRef()).toBe(true)

      clock.timers[0]?.fire()
      await flushing
      await first

      const second = transport.log('INFO', 'b')
      await waitFor(() => clock.timers.length === 2)
      expect(clock.timers[1]?.timer.hasRef()).toBe(false)

      clock.timers[1]?.fire()
      await second
      expect(stub.calls).toHaveLength(4)
    } finally {
      clock.restore()
      stub.restore()
    }
  })
})
