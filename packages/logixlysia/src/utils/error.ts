/**
 * Safely extracts a human-readable message from an unknown error.
 * Handles Error instances, objects with message property, and primitives.
 * Ensures the result is always a string (handles non-string message values).
 */
export const parseError = (error: unknown): string => {
  const fallback = 'An error occurred'

  if (error instanceof Error) {
    return typeof error.message === 'string' ? error.message : fallback
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message
    return typeof msg === 'string' ? msg : String(msg ?? fallback)
  }

  return String(error ?? fallback)
}
