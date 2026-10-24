import { describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { Options } from '../../src/interfaces'
import { sleep } from '../_helpers/sleep'

describe('logixlysia plugin - per-request timing under concurrency', () => {
  test('overlapping requests report independent, correct durations', async () => {
    const calls: { url: string; durationMs: number }[] = []
    const transport = (
      _level: unknown,
      _message: unknown,
      meta?: unknown
    ): void => {
      const record = meta as { request: { url: string }; durationMs: number }
      calls.push({
        durationMs: record.durationMs,
        url: record.request.url
      })
    }

    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }]
      }
    }

    const app = new Elysia()
      .use(logixlysia(options))
      .get('/slow', async () => {
        await sleep(120)
        return 'slow'
      })
      .get('/fast', () => 'fast')

    const slowPromise = app.handle(new Request('http://localhost/slow'))
    await sleep(30)
    await app.handle(new Request('http://localhost/fast'))
    await slowPromise

    const durationFor = (path: string): number => {
      const call = calls.find(c => c.url.endsWith(path))
      if (!call) {
        throw new Error(`no transport call recorded for ${path}`)
      }
      return call.durationMs
    }

    const slowDurationMs = durationFor('/slow')
    const fastDurationMs = durationFor('/fast')

    expect(slowDurationMs).toBeGreaterThanOrEqual(100)
    expect(fastDurationMs).toBeLessThan(100)
  })
})
