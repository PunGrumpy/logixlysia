import type { SinkErrorContext } from '../interfaces'

const REPORT_INTERVAL_MS = 5000

export type ErrorReporter = (
  error: unknown,
  onError?: (context: SinkErrorContext) => void
) => void

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
