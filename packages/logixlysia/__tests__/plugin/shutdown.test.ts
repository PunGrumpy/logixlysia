import { describe, expect, mock, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Elysia } from 'elysia'
import { flushLogixlysia, logixlysia } from '../../src'
import type { Options } from '../../src/interfaces'
import { getFileSink } from '../../src/output/file-sink'
import { spyConsole } from '../_helpers/console'
import { sleep } from '../_helpers/sleep'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const POLL_TIMEOUT_MS = 200
const POLL_INTERVAL_MS = 5
const NO_WAIT_SETTLE_MS = 30

/** `app.stop()` does not await async hooks, so poll for the observable effect. */
const waitFor = (predicate: () => boolean): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  const deadline = Date.now() + POLL_TIMEOUT_MS
  const timer = setInterval(() => {
    if (predicate() || Date.now() >= deadline) {
      clearInterval(timer)
      resolve()
    }
  }, POLL_INTERVAL_MS)
  return promise
}

/** A flush that never settles, to exercise the shutdown timeout. */
const neverSettles = (): Promise<void> => {
  const { promise }: PromiseWithResolvers<void> = Promise.withResolvers()
  return promise
}

const startApp = (options: Options) => {
  const app = new Elysia().use(logixlysia(options))
  app.listen(0)
  return app
}

const baseConfig = {
  disableFileLogging: true,
  disableInternalLogger: true,
  showStartupMessage: false
} as const

describe('plugin shutdown', () => {
  test('onStop flushes transports that implement flush', async () => {
    const flush = mock(() => Promise.resolve())
    const app = startApp({
      config: {
        ...baseConfig,
        transports: [{ flush, log: () => {} }]
      }
    })

    await app.stop()
    await waitFor(() => flush.mock.calls.length > 0)

    expect(flush).toHaveBeenCalledTimes(1)
  })

  test('onStop tolerates transports without flush', async () => {
    const log = mock(() => {})
    const app = startApp({
      config: { ...baseConfig, transports: [{ log }] }
    })

    await app.handle(new Request('http://localhost/no-flush'))
    await app.stop()

    expect(log).toHaveBeenCalled()
  })

  test('onStop reports a timeout through onError with sink shutdown', async () => {
    const onError = mock(() => {})
    const { restore, spies } = spyConsole(['error'])

    try {
      const app = startApp({
        config: {
          ...baseConfig,
          flushTimeoutMs: 20,
          onError,
          transports: [
            {
              flush: neverSettles,
              log: () => {}
            }
          ]
        }
      })

      await app.stop()
      await waitFor(() => onError.mock.calls.length > 0)

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ sink: 'shutdown' })
      )
      expect(spies.error).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  test('onStop with flushTimeoutMs 0 does not wait', async () => {
    const onError = mock(() => {})
    const app = startApp({
      config: {
        ...baseConfig,
        flushTimeoutMs: 0,
        onError,
        transports: [
          {
            flush: neverSettles,
            log: () => {}
          }
        ]
      }
    })

    await app.stop()
    await sleep(NO_WAIT_SETTLE_MS)

    expect(onError).not.toHaveBeenCalled()
  })

  test('flushLogixlysia drains the file sink and closes on request', async () => {
    const dir = await createTempDir()
    try {
      const logFilePath = path.join(dir, 'logs', 'shutdown.log')
      const options: Options = {
        config: {
          disableInternalLogger: true,
          logFilePath,
          showStartupMessage: false
        }
      }
      const app = new Elysia().use(logixlysia(options))
      const sinkBefore = getFileSink(logFilePath)

      await app.handle(new Request('http://localhost/flush-me'))
      await flushLogixlysia(options, { close: true })

      expect(await readFile(logFilePath, 'utf-8')).toContain('/flush-me')
      expect(getFileSink(logFilePath)).not.toBe(sinkBefore)
    } finally {
      await removeTempDir(dir)
    }
  })
})
