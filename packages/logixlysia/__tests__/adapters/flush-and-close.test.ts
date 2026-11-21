import { describe, expect, mock, test } from 'bun:test'
import { createHttpTransport } from '../../src/adapters/shared'
import type {
  BatchTransportOptions,
  HttpTransportInput
} from '../../src/adapters/shared'
import { sleep } from '../_helpers/sleep'
import { waitFor } from '../_helpers/wait-for'
import { holdFetch, settlesWithin, stubFetch, watchTimers } from './helpers'

/** The delay a `Retry-After: 30` answer asks for. */
const RETRY_SLEEP_MS = 30_000
const FLUSH_INTERVAL_MS = 60_000
const TOO_MANY_REQUESTS = { headers: { 'retry-after': '30' }, status: 429 }
const OK = { status: 200 }
/** Generous: a call that stops waiting settles within a few microtasks. */
const SETTLES_MS = 1000
/** Lets the promise callbacks a response or an abort started run. */
const SETTLE_MS = 10

interface Dropped {
  count: number
  reason: 'closed' | 'queue-full' | 'rejected' | 'send-failed'
}

const ok = (): Response => new Response('{}', { status: 200 })

const transportWith = (
  options: BatchTransportOptions,
  rejected?: HttpTransportInput['rejected']
) =>
  createHttpTransport({
    body: entries => JSON.stringify(entries.map(entry => entry.message)),
    headers: {},
    name: 'Test',
    options: {
      flushIntervalMs: FLUSH_INTERVAL_MS,
      onError: () => {},
      retries: 1,
      ...options
    },
    rejected,
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

describe('a flush with a deadline', () => {
  test('resolves at the deadline and leaves the request on the wire to deliver', async () => {
    const fetch = holdFetch()
    const onDropped = mock((_info: Dropped) => {})
    const onError = mock((_error: unknown) => {})
    try {
      const transport = transportWith({ onDropped, onError })
      transport.log('INFO', 'a')
      transport.log('INFO', 'b')
      const deadline = new AbortController()
      const flushing = transport.flush({ signal: deadline.signal })
      await waitFor(() => fetch.requests.length === 1)
      deadline.abort()

      expect(await settlesWithin(flushing, SETTLES_MS)).toBe(true)
      await expect(flushing).resolves.toBeUndefined()
      expect(fetch.requests[0]?.signal.aborted).toBe(false)
      expect(onDropped).not.toHaveBeenCalled()

      fetch.requests[0]?.respond(ok())
      await transport.flush()

      expect(fetch.requests.map(request => request.body)).toEqual(['["a","b"]'])
      expect(onDropped).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    } finally {
      fetch.restore()
    }
  })

  test('reports a request it left behind that then fails, like one nobody awaits', async () => {
    const fetch = holdFetch()
    const onDropped = mock((_info: Dropped) => {})
    const onError = mock((_error: unknown) => {})
    try {
      const transport = transportWith({ onDropped, onError, retries: 0 })
      transport.log('INFO', 'a')
      const deadline = new AbortController()
      const flushing = transport.flush({ signal: deadline.signal })
      await waitFor(() => fetch.requests.length === 1)
      deadline.abort()
      expect(await settlesWithin(flushing, SETTLES_MS)).toBe(true)

      fetch.requests[0]?.respond(new Response('bad key', { status: 401 }))
      await sleep(SETTLE_MS)

      await expect(flushing).resolves.toBeUndefined()
      expect(onDropped.mock.calls).toEqual([
        [{ count: 1, reason: 'send-failed' }]
      ])
      expect(onError.mock.calls).toEqual([
        [new Error('[logixlysia] Test transport: HTTP 401 — bad key')]
      ])
    } finally {
      fetch.restore()
    }
  })

  test('lets go of a retry sleep at the deadline, and the retry still delivers', async () => {
    const stub = stubFetch([TOO_MANY_REQUESTS, OK])
    const clock = watchTimers(RETRY_SLEEP_MS)
    const onDropped = mock((_info: Dropped) => {})
    try {
      const transport = transportWith({ onDropped })
      transport.log('INFO', 'a')
      const deadline = new AbortController()
      const flushing = transport.flush({ signal: deadline.signal })
      await waitFor(() => clock.timers.length === 1)
      expect(clock.timers[0]?.timer.hasRef()).toBe(true)
      deadline.abort()

      expect(await settlesWithin(flushing, SETTLES_MS)).toBe(true)
      expect(clock.timers[0]?.timer.hasRef()).toBe(false)
      expect(clock.timers[0]?.cleared).toBe(false)

      clock.timers[0]?.fire()
      await transport.flush()
      expect(stub.calls).toHaveLength(2)
      expect(onDropped).not.toHaveBeenCalled()
    } finally {
      clock.restore()
      stub.restore()
    }
  })

  test('starts no further request once it left; the interval timer sends the rest', async () => {
    const fetch = holdFetch()
    const interval = watchTimers(FLUSH_INTERVAL_MS)
    try {
      const transport = transportWith({ maxBatchSize: 2 })
      transport.log('INFO', 'a')
      transport.log('INFO', 'b')
      transport.log('INFO', 'c')
      const deadline = new AbortController()
      const flushing = transport.flush({ signal: deadline.signal })
      await waitFor(() => fetch.requests.length === 1)
      deadline.abort()
      expect(await settlesWithin(flushing, SETTLES_MS)).toBe(true)

      fetch.requests[0]?.respond(ok())
      await sleep(SETTLE_MS)
      expect(fetch.requests).toHaveLength(1)

      const armed = interval.timers.filter(item => !item.cleared)
      expect(armed).toHaveLength(1)
      armed[0]?.fire()
      await waitFor(() => fetch.requests.length === 2)
      expect(fetch.requests.map(request => request.body)).toEqual([
        '["a","b"]',
        '["c"]'
      ])

      fetch.requests[1]?.respond(ok())
      await transport.flush()
    } finally {
      interval.restore()
      fetch.restore()
    }
  })

  test('a second flush without a deadline keeps waiting and keeps the sleep held', async () => {
    const stub = stubFetch([TOO_MANY_REQUESTS, OK])
    const clock = watchTimers(RETRY_SLEEP_MS)
    try {
      const transport = transportWith({})
      transport.log('INFO', 'a')
      const deadline = new AbortController()
      const bounded = transport.flush({ signal: deadline.signal })
      const unbounded = transport.flush()
      await waitFor(() => clock.timers.length === 1)
      deadline.abort()

      expect(await settlesWithin(bounded, SETTLES_MS)).toBe(true)
      expect(await settlesWithin(unbounded, SETTLE_MS)).toBe(false)
      expect(clock.timers[0]?.timer.hasRef()).toBe(true)

      clock.timers[0]?.fire()
      await unbounded
      expect(stub.calls).toHaveLength(2)
    } finally {
      clock.restore()
      stub.restore()
    }
  })

  test('with a signal already aborted, resolves at once and still sends', async () => {
    const fetch = holdFetch()
    const onDropped = mock((_info: Dropped) => {})
    try {
      const transport = transportWith({ onDropped })
      transport.log('INFO', 'a')
      const flushing = transport.flush({ signal: AbortSignal.abort() })

      expect(await settlesWithin(flushing, SETTLES_MS)).toBe(true)
      await waitFor(() => fetch.requests.length === 1)
      expect(fetch.requests.map(request => request.body)).toEqual(['["a"]'])

      fetch.requests[0]?.respond(ok())
      await transport.flush()
      expect(onDropped).not.toHaveBeenCalled()
    } finally {
      fetch.restore()
    }
  })
})

describe('a close with a deadline', () => {
  test('aborts the request, gives up the buffered entries and reports both once', async () => {
    const fetch = holdFetch()
    const onDropped = mock((_info: Dropped) => {})
    const onError = mock((_error: unknown) => {})
    try {
      const transport = transportWith({ maxBatchSize: 3, onDropped, onError })
      for (const message of ['a', 'b', 'c', 'd', 'e']) {
        transport.log('INFO', message)
      }
      const deadline = new AbortController()
      const closing = transport.close({ signal: deadline.signal })
      await waitFor(() => fetch.requests.length === 1)
      deadline.abort()

      expect(await settlesWithin(closing, SETTLES_MS)).toBe(true)
      await expect(closing).rejects.toThrow(
        '[logixlysia] Test transport: close gave up on 5 entries at its deadline'
      )
      expect(fetch.requests[0]?.signal.aborted).toBe(true)
      await sleep(SETTLE_MS)
      expect(onDropped.mock.calls).toEqual([[{ count: 5, reason: 'closed' }]])
      expect(onError).not.toHaveBeenCalled()
      expect(fetch.requests).toHaveLength(1)
    } finally {
      fetch.restore()
    }
  })

  test('ends a retry sleep at once and makes no further request', async () => {
    const stub = stubFetch([TOO_MANY_REQUESTS])
    const clock = watchTimers(RETRY_SLEEP_MS)
    const onDropped = mock((_info: Dropped) => {})
    const onError = mock((_error: unknown) => {})
    try {
      const transport = transportWith({ onDropped, onError, retries: 2 })
      transport.log('INFO', 'a')
      const deadline = new AbortController()
      const closing = transport.close({ signal: deadline.signal })
      await waitFor(() => clock.timers.length === 1)
      deadline.abort()

      expect(await settlesWithin(closing, SETTLES_MS)).toBe(true)
      await expect(closing).rejects.toThrow(
        '[logixlysia] Test transport: close gave up on 1 entries at its deadline'
      )
      expect(clock.timers[0]?.cleared).toBe(true)
      await sleep(SETTLE_MS)
      expect(stub.calls).toHaveLength(1)
      expect(onDropped.mock.calls).toEqual([[{ count: 1, reason: 'closed' }]])
      expect(onError).not.toHaveBeenCalled()
    } finally {
      clock.restore()
      stub.restore()
    }
  })

  test('resolves and reports nothing when nothing is left at the deadline', async () => {
    const stub = stubFetch([OK])
    const onDropped = mock((_info: Dropped) => {})
    try {
      const transport = transportWith({ onDropped })
      transport.log('INFO', 'a')
      await transport.flush()

      await expect(
        transport.close({ signal: AbortSignal.abort() })
      ).resolves.toBeUndefined()
      expect(onDropped).not.toHaveBeenCalled()
      expect(stub.calls).toHaveLength(1)
    } finally {
      stub.restore()
    }
  })

  test('counts a response that lands in the turn of the deadline once, as closed', async () => {
    const fetch = holdFetch()
    const onDropped = mock((_info: Dropped) => {})
    const onError = mock((_error: unknown) => {})
    try {
      const transport = transportWith({ maxBatchSize: 2, onDropped, onError })
      transport.log('INFO', 'a')
      transport.log('INFO', 'b')
      const deadline = new AbortController()
      const closing = transport.close({ signal: deadline.signal })
      await waitFor(() => fetch.requests.length === 1)

      fetch.requests[0]?.respond(ok())
      deadline.abort()

      expect(await settlesWithin(closing, SETTLES_MS)).toBe(true)
      await expect(closing).rejects.toThrow(
        '[logixlysia] Test transport: close gave up on 2 entries at its deadline'
      )
      await sleep(SETTLE_MS)
      expect(onDropped.mock.calls).toEqual([[{ count: 2, reason: 'closed' }]])
      expect(onError).not.toHaveBeenCalled()
    } finally {
      fetch.restore()
    }
  })

  test('does not report a rejected count that arrives after it gave the batch up', async () => {
    const fetch = holdFetch()
    const onDropped = mock((_info: Dropped) => {})
    const onError = mock((_error: unknown) => {})
    let body: ReadableStreamDefaultController<Uint8Array> | undefined
    try {
      const transport = transportWith(
        { maxBatchSize: 1, onDropped, onError },
        () => ({ count: 1 })
      )
      transport.log('INFO', 'a')
      const deadline = new AbortController()
      const closing = transport.close({ signal: deadline.signal })
      await waitFor(() => fetch.requests.length === 1)
      fetch.requests[0]?.respond(
        new Response(
          new ReadableStream<Uint8Array>({
            start: controller => {
              body = controller
            }
          }),
          { status: 200 }
        )
      )
      await sleep(SETTLE_MS)
      deadline.abort()

      expect(await settlesWithin(closing, SETTLES_MS)).toBe(true)
      await expect(closing).rejects.toThrow(
        '[logixlysia] Test transport: close gave up on 1 entries at its deadline'
      )
      body?.enqueue(new TextEncoder().encode('{"rejected":1}'))
      body?.close()
      await sleep(SETTLE_MS)

      expect(onDropped.mock.calls).toEqual([[{ count: 1, reason: 'closed' }]])
      expect(onError).not.toHaveBeenCalled()
    } finally {
      fetch.restore()
    }
  })

  test('with a signal already aborted, gives up at once without a request', async () => {
    const fetch = holdFetch()
    const onDropped = mock((_info: Dropped) => {})
    try {
      const transport = transportWith({ onDropped })
      transport.log('INFO', 'a')
      transport.log('INFO', 'b')
      const closing = transport.close({ signal: AbortSignal.abort() })

      expect(await settlesWithin(closing, SETTLES_MS)).toBe(true)
      await expect(closing).rejects.toThrow(
        '[logixlysia] Test transport: close gave up on 2 entries at its deadline'
      )
      await sleep(SETTLE_MS)
      expect(onDropped.mock.calls).toEqual([[{ count: 2, reason: 'closed' }]])
      expect(fetch.requests).toHaveLength(0)
    } finally {
      fetch.restore()
    }
  })

  test('reports a log() after the deadline as closed', async () => {
    const fetch = holdFetch()
    const onDropped = mock((_info: Dropped) => {})
    try {
      const transport = transportWith({ onDropped })
      transport.log('INFO', 'a')
      const closing = transport.close({ signal: AbortSignal.abort() })
      expect(await settlesWithin(closing, SETTLES_MS)).toBe(true)
      await closing.catch(() => {})

      transport.log('INFO', 'late')

      expect(onDropped.mock.calls).toEqual([
        [{ count: 1, reason: 'closed' }],
        [{ count: 1, reason: 'closed' }]
      ])
      expect(fetch.requests).toHaveLength(0)
    } finally {
      fetch.restore()
    }
  })
})
