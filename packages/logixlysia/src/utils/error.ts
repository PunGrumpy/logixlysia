export const parseError = (error: unknown): string => {
  let message = 'An error occurred'

  if (error instanceof Error) {
    message = error.message
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = error.message as string
  } else {
    message = String(error)
  }

  return message
}

export interface StructuredError {
  fix?: string
  internal?: unknown
  link?: string
  why?: string
}

export const isStructuredError = (
  value: unknown
): value is StructuredError & Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  ('why' in value || 'fix' in value || 'link' in value || 'internal' in value)
