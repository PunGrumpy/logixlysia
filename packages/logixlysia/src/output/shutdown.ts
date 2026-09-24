import type { Options, SinkErrorContext } from '../interfaces'
import { settle } from '../utils/settle'
import { flushAllFileSinks } from './file-sink'
import { flushTransports } from './index'

/**
 * Resolves `true` when `ms` elapsed before `work` settled, `false` otherwise.
 * A non-positive `ms` means "start the work but do not wait".
 */
export const raceWithTimeout = async (
  work: Promise<unknown>,
  ms: number
): Promise<boolean> => {
  // The sinks report a failed flush themselves; here it only counts as
  // settled.
  const settled = settle(work)

  if (ms <= 0) {
    return true
  }

  const timeout = Promise.withResolvers<'timeout'>()
  const timer = setTimeout(() => timeout.resolve('timeout'), ms)
  // Never hold the event loop open just to observe a flush that is racing
  // an exiting process.
  timer.unref?.()
  const winner = await Promise.race([settled, timeout.promise])
  clearTimeout(timer)
  return winner === 'timeout'
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
