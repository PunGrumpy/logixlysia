import type { Options, SinkErrorContext } from '../interfaces'
import { closeAllFileSinks, flushAllFileSinks } from './file-sink'
import {
  closeTransports,
  flushTransports,
  untilSettledOrAborted
} from './index'

/**
 * An `AbortSignal` that aborts `ms` from now, or at once for `0`. Its timer
 * holds the process until it fires or `dispose` clears it, so a caller
 * waiting on the signal is always answered.
 */
export const startDeadline = (
  ms: number
): { dispose: () => void; signal: AbortSignal } => {
  const controller = new AbortController()
  const timer = ms > 0 ? setTimeout(() => controller.abort(), ms) : undefined
  if (timer === undefined) {
    controller.abort()
  }
  return { dispose: () => clearTimeout(timer), signal: controller.signal }
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

export const flushAll = async (
  options: Options,
  signal?: AbortSignal
): Promise<void> => {
  const files = flushAllFileSinks()
  await Promise.allSettled([
    flushTransports(options, signal),
    signal ? untilSettledOrAborted(files, signal) : files
  ])
}

/**
 * Flushes every transport and file sink and, with `close`, releases them,
 * waiting at most `timeoutMs` for both. Transports get the deadline as
 * `{ signal }`; a file write is only waited for, never aborted. Reports
 * once if the deadline passed; `0` starts the work and neither waits nor
 * reports.
 */
export const shutdownWithin = async (
  options: Options,
  timeoutMs: number,
  { close }: { close: boolean }
): Promise<void> => {
  const deadline = startDeadline(timeoutMs)
  try {
    await flushAll(options, deadline.signal)
    if (close) {
      await Promise.allSettled([
        closeTransports(options, deadline.signal),
        untilSettledOrAborted(closeAllFileSinks(), deadline.signal)
      ])
    }
  } finally {
    deadline.dispose()
  }
  if (deadline.signal.aborted && timeoutMs > 0) {
    reportShutdownTimeout(options.config?.onError, timeoutMs)
  }
}
