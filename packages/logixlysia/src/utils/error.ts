import { STATUS_CODES } from 'node:http'
import { isStatusResponse } from '../helpers/status'
import { toText } from './sanitize'

const NON_ERROR_OBJECT_MESSAGE = 'Non-Error object'

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// Elysia copies a `status(code, body)` body into `error.message`, so a message
// is not always a string.
export const parseError = (error: unknown): string => {
  if (error instanceof Error) {
    return toText(error.message)
  }
  if (typeof error === 'object' && error !== null && !Array.isArray(error)) {
    return 'message' in error && typeof error.message === 'string'
      ? toText(error.message)
      : NON_ERROR_OBJECT_MESSAGE
  }
  return String(error)
}

export interface StructuredError {
  code?: string
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
  ('why' in value ||
    'fix' in value ||
    'link' in value ||
    'code' in value ||
    'internal' in value)

export interface NormalizedLoggedError {
  error: Record<string, unknown>
  message: string
}

const isValidationErrorLike = (
  value: unknown
): value is Error & { all?: unknown[]; status?: number; type?: string } =>
  value instanceof Error &&
  // `code` is Elysia's minification-safe discriminant — `.name` and
  // `.constructor.name` both degrade to a mangled string under bundler
  // minification (e.g. `bun build --minify`, esbuild), so `code` must be
  // checked too or validation bodies silently re-leak in that build mode.
  ((value as { code?: unknown }).code === 'VALIDATION' ||
    value.name === 'ValidationError' ||
    value.constructor?.name === 'ValidationError')

const STRUCTURED_ERROR_KEYS = [
  'code',
  'fix',
  'internal',
  'link',
  'message',
  'name',
  'status',
  'why'
] as const

const copyStructuredErrorFields = (
  record: Record<string, unknown>
): Record<string, unknown> => {
  const safe: Record<string, unknown> = {}
  for (const key of STRUCTURED_ERROR_KEYS) {
    if (record[key] !== undefined) {
      safe[key] = record[key]
    }
  }
  return safe
}

const MAX_CAUSE_DEPTH = 3
const FIRST_SERVER_ERROR_STATUS = 500

export const normalizeLoggedError = (
  error: unknown,
  logErrorPayload: boolean,
  depth = 0
): NormalizedLoggedError => {
  const withCause = (
    safe: Record<string, unknown>,
    record: Record<string, unknown>
  ): Record<string, unknown> => {
    const { cause } = record
    if (cause === undefined || depth >= MAX_CAUSE_DEPTH) {
      return safe
    }
    safe.cause =
      cause instanceof Error || isStructuredError(cause)
        ? normalizeLoggedError(cause, logErrorPayload, depth + 1).error
        : cause
    return safe
  }

  if (isStatusResponse(error)) {
    const message =
      typeof error.response === 'string' && error.response !== ''
        ? error.response
        : (STATUS_CODES[error.code] ?? `HTTP ${error.code}`)
    return {
      error: { message, name: 'StatusResponse', status: error.code },
      message
    }
  }

  if (isValidationErrorLike(error) && !logErrorPayload) {
    const failures = Array.isArray(error.all) ? error.all : []
    const paths = failures
      .map(failure =>
        typeof failure === 'object' && failure !== null && 'path' in failure
          ? String((failure as { path: unknown }).path)
          : ''
      )
      .filter(Boolean)
    const scope = typeof error.type === 'string' ? error.type : 'request'
    const message =
      paths.length > 0
        ? `Validation failed (${scope}): ${paths.join(', ')}`
        : `Validation failed (${scope})`
    return {
      error: {
        failedPaths: paths,
        message,
        name: 'ValidationError',
        type: scope
      },
      message
    }
  }

  if (error instanceof Error) {
    const safe = copyStructuredErrorFields(
      error as unknown as Record<string, unknown>
    )
    safe.message = error.message
    // Native subclasses (e.g. `class HttpError extends Error`) don't set
    // `.name` unless the author overrides it, so it reads back as the
    // generic "Error". Prefer the constructor name in that case.
    safe.name =
      error.name === 'Error'
        ? (error.constructor?.name ?? error.name)
        : error.name
    const { status } = error as { status?: unknown }
    const isClientError =
      typeof status === 'number' && status < FIRST_SERVER_ERROR_STATUS
    if (!isClientError && error.stack !== undefined) {
      safe.stack = error.stack
    }
    return {
      error: withCause(safe, error as unknown as Record<string, unknown>),
      message: parseError(error)
    }
  }

  if (isPlainObject(error)) {
    const message = parseError(error)
    const record: Record<string, unknown> = { ...error, message }
    return { error: withCause(record, error), message }
  }

  const message = parseError(error)

  if (isStructuredError(error)) {
    const safe = copyStructuredErrorFields(error as Record<string, unknown>)
    safe.message = message
    return {
      error: withCause(safe, error as Record<string, unknown>),
      message
    }
  }

  return { error: { message, value: String(error) }, message }
}
