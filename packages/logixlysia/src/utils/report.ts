import type { SinkErrorContext } from '../interfaces'

const REPORT_INTERVAL_MS = 5000

export type ErrorReporter = (
  error: unknown,
  onError?: (context: SinkErrorContext) => void
) => void

/**
 * Routes a failure to `config.onError`, or — when no hook is configured — to
 * stderr at most once per interval, so a component that fails on every request
 * cannot flood the very log it is meant to be feeding.
 */
export const createErrorReporter = (
  sink: SinkErrorContext['sink'],
  label: string
): ErrorReporter => {
  let lastReportedAt = 0

  return (error, onError) => {
    if (onError) {
      try {
        onError({ error, sink })
      } catch {
        // Swallow errors thrown by the hook itself.
      }
      return
    }

    const now = Date.now()
    if (now - lastReportedAt < REPORT_INTERVAL_MS) {
      return
    }
    lastReportedAt = now
    console.error(`[logixlysia] ${label}:`, error)
  }
}
