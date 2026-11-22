import { describe, expect, mock, test } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Elysia } from 'elysia'
import { flushLogixlysia, logixlysia } from '../../src'
import { createHttpTransport } from '../../src/adapters/shared'
import type { Options, SinkErrorContext } from '../../src/interfaces'
import { CHILD_PROCESS_TIMEOUT_MS } from '../_helpers/child-process'
import { neverSettles } from '../_helpers/never-settles'
import { createTempDir, removeTempDir } from '../_helpers/tmp'
import { waitFor } from '../_helpers/wait-for'
import {
  holdFetch,
  settlesWithin,
  stubFetch,
  watchTimers
} from '../adapters/helpers'

const packageRoot = path.join(import.meta.dir, '..', '..')
const DEADLINE_MS = 50
/** Generous: a call bounded by a 50 ms deadline settles long before this. */
const SETTLES_MS = 2000
/** The delay a `Retry-After: 30` answer asks for. */
const RETRY_SLEEP_MS = 30_000
/** Without a deadline the child would wait 15 s or more; with one, well under this. */
const MAX_EXIT_MS = 5000
/** Ends a child that still runs, so a failing test leaves no process behind. */
const CHILD_KILL_MS = 20_000
const TIMEOUT_REPORT =
  '[logixlysia] shutdown flush did not complete within 50ms; some transport or file writes may not have been flushed.'

const baseConfig = {
  disableFileLogging: true,
  disableInternalLogger: true,
  showStartupMessage: false
} as const

interface Dropped {
  count: number
  reason: string
}

const reportsOf = (onError: {
  mock: { calls: SinkErrorContext[][] }
}): [string, string][] =>
  onError.mock.calls.map(([context]) => [
    context.sink,
    (context.error as Error).message
  ])

describe('flushLogixlysia with timeoutMs', () => {
  test('stops waiting at the deadline and reports it once', async () => {
    const onError = mock((_context: SinkErrorContext) => {})
    const options: Options = {
      config: {
        ...baseConfig,
        onError,
        transports: [{ flush: neverSettles, log: () => {} }]
      }
    }

    const startedAt = performance.now()
    const flushing = flushLogixlysia(options, { timeoutMs: DEADLINE_MS })

    expect(await settlesWithin(flushing, SETTLES_MS)).toBe(true)
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(
      DEADLINE_MS - 5
    )
    expect(reportsOf(onError)).toEqual([['shutdown', TIMEOUT_REPORT]])
  })

  test('with close, still calls close after the flush used up the deadline, with the signal aborted', async () => {
    const onError = mock((_context: SinkErrorContext) => {})
    const closeCalls: ({ signal?: AbortSignal } | undefined)[] = []
    const options: Options = {
      config: {
        ...baseConfig,
        onError,
        transports: [
          {
            close: closeOptions => {
              closeCalls.push(closeOptions)
            },
            flush: neverSettles,
            log: () => {}
          }
        ]
      }
    }

    const flushing = flushLogixlysia(options, {
      close: true,
      timeoutMs: DEADLINE_MS
    })

    expect(await settlesWithin(flushing, SETTLES_MS)).toBe(true)
    expect(closeCalls).toHaveLength(1)
    expect(closeCalls[0]?.signal?.aborted).toBe(true)
    expect(reportsOf(onError)).toEqual([['shutdown', TIMEOUT_REPORT]])
  })

  test('with close, an adapter whose backend never answers gives up and reports its entries', async () => {
    const fetch = holdFetch()
    const onError = mock((_context: SinkErrorContext) => {})
    const dropped: Dropped[] = []
    try {
      const adapter = createHttpTransport({
        body: entries => JSON.stringify(entries),
        headers: {},
        name: 'Test',
        options: { onDropped: info => dropped.push(info) },
        url: 'https://ingest.example/v1'
      })
      for (const message of ['a', 'b', 'c']) {
        adapter.log('INFO', message)
      }
      const options: Options = {
        config: { ...baseConfig, onError, transports: [adapter] }
      }

      const flushing = flushLogixlysia(options, {
        close: true,
        timeoutMs: DEADLINE_MS
      })

      expect(await settlesWithin(flushing, SETTLES_MS)).toBe(true)
      expect(fetch.requests).toHaveLength(1)
      expect(fetch.requests[0]?.signal.aborted).toBe(true)
      expect(dropped).toEqual([{ count: 3, reason: 'closed' }])
      expect(reportsOf(onError)).toEqual([
        [
          'transport',
          '[logixlysia] Test transport: close gave up on 3 entries at its deadline'
        ],
        ['shutdown', TIMEOUT_REPORT]
      ])
    } finally {
      fetch.restore()
    }
  })

  test('without timeoutMs, calls flush and close with no argument and reports nothing', async () => {
    const onError = mock((_context: SinkErrorContext) => {})
    const calls: [string, number][] = []
    const options: Options = {
      config: {
        ...baseConfig,
        onError,
        transports: [
          {
            close: (...args: unknown[]) => {
              calls.push(['close', args.length])
            },
            flush: (...args: unknown[]) => {
              calls.push(['flush', args.length])
            },
            log: () => {}
          }
        ]
      }
    }

    await flushLogixlysia(options, { close: true })

    expect(calls).toEqual([
      ['flush', 0],
      ['close', 0]
    ])
    expect(onError).not.toHaveBeenCalled()
  })

  test.each([-1, Number.NaN, 2_147_483_648, Number.POSITIVE_INFINITY])(
    'throws for a timeoutMs of %p, as for the same flushTimeoutMs',
    value => {
      expect(() =>
        flushLogixlysia({ config: baseConfig }, { timeoutMs: value })
      ).toThrow(
        `logixlysia: invalid output config — timeoutMs must be a finite number of milliseconds between 0 and 2147483647, got ${value}`
      )
      expect(() =>
        logixlysia({ config: { ...baseConfig, flushTimeoutMs: value } })
      ).toThrow(
        `logixlysia: invalid output config — flushTimeoutMs must be a finite number of milliseconds between 0 and 2147483647, got ${value}`
      )
    }
  )

  test('timeoutMs 0 starts the flush and resolves without waiting or reporting', async () => {
    const onError = mock((_context: SinkErrorContext) => {})
    const flush = mock(neverSettles)
    const options: Options = {
      config: {
        ...baseConfig,
        onError,
        transports: [{ flush, log: () => {} }]
      }
    }

    const flushing = flushLogixlysia(options, { timeoutMs: 0 })

    expect(await settlesWithin(flushing, SETTLES_MS)).toBe(true)
    expect(flush).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('the stop hook', () => {
  test('passes its deadline on, so a retry sleep stops holding the process', async () => {
    const stub = stubFetch([
      { headers: { 'retry-after': '30' }, status: 429 },
      { status: 200 }
    ])
    const clock = watchTimers(RETRY_SLEEP_MS)
    const onError = mock((_context: SinkErrorContext) => {})
    try {
      const adapter = createHttpTransport({
        body: entries => JSON.stringify(entries),
        headers: {},
        name: 'Test',
        options: { onError: () => {}, retries: 1 },
        url: 'https://ingest.example/v1'
      })
      const app = new Elysia().use(
        logixlysia({
          config: {
            ...baseConfig,
            flushTimeoutMs: DEADLINE_MS,
            onError,
            transports: [adapter]
          }
        })
      )
      app.listen(0)
      adapter.log('INFO', 'a')

      await app.stop(true)
      await waitFor(() => onError.mock.calls.length > 0)

      expect(reportsOf(onError)).toEqual([['shutdown', TIMEOUT_REPORT]])
      expect(clock.timers).toHaveLength(1)
      expect(clock.timers[0]?.timer.hasRef()).toBe(false)

      clock.timers[0]?.fire()
      await adapter.flush()
      expect(stub.calls).toHaveLength(2)
    } finally {
      clock.restore()
      stub.restore()
    }
  })
})

const childScript = (bounded: string): string => `
import { flushLogixlysia } from ${JSON.stringify(path.join(packageRoot, 'src', 'index.ts'))}
import { createHttpTransport } from ${JSON.stringify(path.join(packageRoot, 'src', 'http.ts'))}
const dropped = []
const transport = createHttpTransport({
  body: entries => JSON.stringify(entries),
  headers: {},
  name: 'child',
  options: { onDropped: info => dropped.push(info), onError: () => {} },
  url: process.env.INGEST_URL
})
const options = { config: { onError: () => {}, transports: [transport] } }
for (const message of ['a', 'b', 'c']) {
  transport.log('INFO', message)
}
const startedAt = performance.now()
${bounded}
process.on('exit', () => {
  console.log(JSON.stringify({ dropped, exitMs: performance.now() - startedAt }))
})
`

const runChild = async (
  bounded: string,
  handle: () => Response | Promise<Response>
): Promise<{ dropped: Dropped[]; exitMs: number }> => {
  const server = Bun.serve({ fetch: handle, hostname: '127.0.0.1', port: 0 })
  const dir = await createTempDir()
  try {
    const scriptPath = path.join(dir, 'shutdown.ts')
    await writeFile(scriptPath, childScript(bounded))
    const child = Bun.spawn(['bun', scriptPath], {
      cwd: packageRoot,
      env: {
        ...process.env,
        INGEST_URL: `http://127.0.0.1:${server.port}/ingest`
      },
      stderr: 'pipe',
      stdout: 'pipe',
      timeout: CHILD_KILL_MS
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited
    ])
    if (exitCode !== 0) {
      throw new Error(`child exited with ${exitCode}: ${stderr}`)
    }
    return JSON.parse(stdout.trim().split('\n').at(-1) ?? '')
  } finally {
    await server.stop(true)
    await removeTempDir(dir)
  }
}

describe('a process that shuts down with a deadline', () => {
  test(
    'exits by itself after a bounded close against a backend that never answers',
    async () => {
      const result = await runChild(
        'await flushLogixlysia(options, { close: true, timeoutMs: 300 })',
        () => neverSettles().then(() => new Response(''))
      )

      expect(result.dropped).toEqual([{ count: 3, reason: 'closed' }])
      expect(result.exitMs).toBeLessThan(MAX_EXIT_MS)
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'exits by itself after a bounded flush against a backend answering 429 with Retry-After: 30',
    async () => {
      const result = await runChild(
        'await flushLogixlysia(options, { timeoutMs: 300 })',
        () =>
          new Response('', { headers: { 'retry-after': '30' }, status: 429 })
      )

      expect(result.dropped).toEqual([])
      expect(result.exitMs).toBeLessThan(MAX_EXIT_MS)
    },
    CHILD_PROCESS_TIMEOUT_MS
  )
})
