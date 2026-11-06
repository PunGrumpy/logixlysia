import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { HttpError, logixlysia, useLogger } from '../../src'
import type { Options } from '../../src'
import { sleep } from '../_helpers/sleep'

interface CapturedEvent {
  level: string
  message: string
  meta: {
    context?: Record<string, unknown>
    durationMs?: number
    request?: { method?: string; url?: string }
    status?: number
  }
}

const build = (config: NonNullable<Options['config']> = {}) => {
  const events: CapturedEvent[] = []
  const transport = mock(
    (level: string, message: string, meta?: CapturedEvent['meta']) => {
      events.push({ level, message, meta: meta ?? {} })
    }
  )
  const logs = logixlysia({
    config: {
      ...config,
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }]
    }
  })
  return { events, logs }
}

const lineFor = (events: CapturedEvent[], pathEnd: string): CapturedEvent => {
  const line = events.find(event => event.meta.request?.url?.endsWith(pathEnd))
  if (!line) {
    throw new Error(`no line for ${pathEnd}`)
  }
  return line
}

describe('runJob', () => {
  test('returns the value and writes one JOB line with status and duration', async () => {
    const { events, logs } = build()

    const value = await logs.runJob('nightly-sync', () => 42)

    expect(value).toBe(42)
    expect(events).toHaveLength(1)
    const [line] = events
    expect(line?.level).toBe('INFO')
    expect(line?.meta.request?.method).toBe('JOB')
    expect(line?.meta.request?.url).toEndWith('/nightly-sync')
    expect(line?.meta.status).toBe(200)
    expect(typeof line?.meta.durationMs).toBe('number')
  })

  test('puts mergeContext on the final line', async () => {
    const { events, logs } = build()

    await logs.runJob('nightly-sync', log => {
      log.mergeContext({ rows: 3 })
    })

    expect(events[0]?.meta.context?.rows).toBe(3)
  })

  test('a log.info inside the job does not replace the final line', async () => {
    const { events, logs } = build()

    await logs.runJob('nightly-sync', log => {
      log.info('step')
    })

    expect(events.map(event => event.message)).toHaveLength(2)
    expect(events[0]?.message).toBe('step')
    expect(events[1]?.meta.status).toBe(200)
  })

  test('useLogger reaches the job after an await without useAsyncLocalStorage, and is a no-op afterwards', async () => {
    const { events, logs } = build()

    await logs.runJob('nightly-sync', async () => {
      await sleep(5)
      useLogger().mergeContext({ a: 1 })
    })
    const countAfterJob = events.length
    useLogger().info('x')

    expect(events[0]?.meta.context?.a).toBe(1)
    expect(events).toHaveLength(countAfterJob)
  })

  test('rethrows the same error after writing one ERROR line with status 500', async () => {
    const { events, logs } = build()
    const failure = new Error('db down')

    const outcome = await logs
      .runJob('nightly-sync', () => {
        throw failure
      })
      .catch((error: unknown) => error)

    expect(outcome).toBe(failure)
    expect(events).toHaveLength(1)
    expect(events[0]?.level).toBe('ERROR')
    expect(events[0]?.meta.status).toBe(500)
    expect(events[0]?.message).toContain('db down')
  })

  test('logs 500 for a thrown HttpError too', async () => {
    const { events, logs } = build()
    const failure = new HttpError(402, 'pay up')

    const outcome = await logs
      .runJob('nightly-sync', async () => {
        await sleep(1)
        throw failure
      })
      .catch((error: unknown) => error)

    expect(outcome).toBe(failure)
    expect(events).toHaveLength(1)
    expect(events[0]?.meta.status).toBe(500)
  })

  test('keeps a job in the head sample when a tail path matches', async () => {
    const { events, logs } = build({
      sampling: { head: { INFO: 0 }, tail: { paths: ['/nightly-sync'] } }
    })

    await logs.runJob('nightly-sync', () => 1)

    expect(events).toHaveLength(1)
  })

  test('drops a successful job under a tail status rule', async () => {
    const { events, logs } = build({
      sampling: { head: { INFO: 0 }, tail: { status: 500 } }
    })

    await logs.runJob('nightly-sync', () => 1)

    expect(events).toHaveLength(0)
  })

  test('keeps the error line and buffered lines of a failed job under a tail status rule', async () => {
    const { events, logs } = build({
      sampling: { head: { INFO: 0 }, tail: { status: 500 } }
    })

    await logs
      .runJob('nightly-sync', log => {
        log.info('about to fail')
        throw new Error('boom')
      })
      .catch(() => {})

    expect(events.map(event => event.level).toSorted()).toEqual([
      'ERROR',
      'INFO'
    ])
    expect(events.some(event => event.message === 'about to fail')).toBe(true)
  })

  test('an accessLine filter does not hide a job line', async () => {
    const { events, logs } = build({
      logFilter: { accessLine: { include: ['/api/**'] } }
    })

    await logs.runJob('nightly-sync', () => 1)

    expect(events).toHaveLength(1)
  })

  test('applies enrichers and the request id', async () => {
    const { events, logs } = build({
      enrichers: [() => ({ tenant: 'acme' })],
      requestId: true
    })

    await logs.runJob('nightly-sync', () => 1)

    expect(events[0]?.meta.context?.tenant).toBe('acme')
    expect(typeof events[0]?.meta.context?.requestId).toBe('string')
  })

  test('keeps the contexts of concurrent jobs apart', async () => {
    const { events, logs } = build()

    await Promise.all([
      logs.runJob('job-a', async log => {
        log.mergeContext({ who: 'a' })
        await sleep(10)
        useLogger().mergeContext({ late: 'a' })
      }),
      logs.runJob('job-b', async () => {
        await sleep(2)
        useLogger().mergeContext({ who: 'b' })
      })
    ])

    expect(lineFor(events, '/job-a').meta.context).toEqual({
      late: 'a',
      who: 'a'
    })
    expect(lineFor(events, '/job-b').meta.context).toEqual({ who: 'b' })
  })

  test('rejects an empty or non-string name with a TypeError and never calls fn', async () => {
    const { events, logs } = build()
    const fn = mock(() => 1)

    await expect(logs.runJob('', fn)).rejects.toBeInstanceOf(TypeError)
    await expect(logs.runJob(7 as never, fn)).rejects.toBeInstanceOf(TypeError)

    expect(fn).not.toHaveBeenCalled()
    expect(events).toHaveLength(0)
  })

  test('calling runJob from a handler leaves the handler line and context alone', async () => {
    const { events, logs } = build()
    const app = new Elysia().use(logs).get('/outer', async ({ log }) => {
      log.mergeContext({ outer: true })
      await logs.runJob('inner', job => {
        job.mergeContext({ inner: true })
      })
      return 'ok'
    })

    await app.handle(new Request('http://localhost/outer'))

    const outer = lineFor(events, '/outer')
    expect(outer.meta.request?.method).toBe('GET')
    expect(outer.meta.context).toEqual({ outer: true })
    expect(lineFor(events, '/inner').meta.context).toEqual({ inner: true })
    expect(events).toHaveLength(2)
  })
})
