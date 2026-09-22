import type { Options, SinkErrorContext } from '../interfaces'
import { flushAllFileSinks } from './file-sink'
import { flushTransports } from './index'

/** Resolves once `work` settles, whichever way. */
const settle = async (work: Promise<unknown>): Promise<void> => {
  try {
    await work
  } catch {
    // A failed flush is reported by the sinks themselves; here it only counts
    // as "settled".
  }
}

/**
 * Resolves `true` when `ms` elapsed before `work` settled, `false` otherwise.
 * A non-positive `ms` means "start the work but do not wait".
 */
export const raceWithTimeout = (
  work: Promise<unknown>,
  ms: number
): Promise<boolean> => {
  const settled = settle(work)

  if (ms <= 0) {
    return Promise.resolve(true)
  }

  const { promise, resolve } = Promise.withResolvers<boolean>()
  const timer = setTimeout(() => resolve(true), ms)
  // Never hold the event loop open just to observe a flush that is racing
  // an exiting process.
  timer.unref?.()
  const settleFirst = async (): Promise<void> => {
    await settled
    clearTimeout(timer)
    resolve(false)
  }
  settleFirst()
  return promise
}

/**
 * Reports a shutdown flush that ran out of time — through `onError` when the
 * hook exists, otherwise on stderr, but never both.
 */
export const reportShutdownTimeout = (
  onError: ((context: SinkErrorContext) => void) | undefined,
  timeoutMs: number
): void => {
  const error = new Error(
    `[logixlysia] shutdown flush did not complete within ${timeoutMs}ms; some transport or file writes may not have been flushed.`
  )

  if (onError) {
    try {
      onError({ error, sink: 'shutdown' })
    } catch {
      // Swallow errors thrown by the hook itself.
    }
    return
  }

  console.error(error.message)
}

/** Drains every transport and every registered file sink. */
export const flushAll = async (options: Options): Promise<void> => {
  await Promise.allSettled([flushTransports(options), flushAllFileSinks()])
}
