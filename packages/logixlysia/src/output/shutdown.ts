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
  const settled = settle(work)

  if (ms <= 0) {
    return true
  }

  const timeout = Promise.withResolvers<'timeout'>()
  const timer = setTimeout(() => timeout.resolve('timeout'), ms)
  timer.unref?.()
  const winner = await Promise.race([settled, timeout.promise])
  clearTimeout(timer)
  return winner === 'timeout'
}

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

export const flushAll = async (options: Options): Promise<void> => {
  await Promise.allSettled([flushTransports(options), flushAllFileSinks()])
}
