import { asStatusResponse } from '../helpers/status'
import { toText } from './sanitize'
import { STATUS_TEXT } from './status-text'

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

const isElysia2ValidationShape = (value: Error): boolean => {
  const { code, errors, type } = value as {
    code?: unknown
    errors?: unknown
    type?: unknown
  }
  return (
    code === 'validation' && typeof type === 'string' && Array.isArray(errors)
  )
}

const isValidationErrorLike = (
  value: unknown
): value is Error & {
  all?: unknown[]
  errors?: unknown
  status?: number
  type?: string
  value?: unknown
} =>
  value instanceof Error &&
  // `code` is Elysia's minification-safe discriminant — `.name` and
  // `.constructor.name` both degrade to a mangled string under bundler
  // minification (e.g. `bun build --minify`, esbuild), so `code` must be
  // checked too or validation bodies silently re-leak in that build mode.
  // Elysia 1.x spells it `VALIDATION`, 2.x `validation`; an app's own error
  // may use the lowercase one too, so 2.x's also needs Elysia's own fields.
  ((value as { code?: unknown }).code === 'VALIDATION' ||
    isElysia2ValidationShape(value) ||
    value.name === 'ValidationError' ||
    value.constructor?.name === 'ValidationError')

const pathOf = (failure: unknown, key: string): string => {
  if (typeof failure !== 'object' || failure === null || !(key in failure)) {
    return ''
  }
  return String((failure as Record<string, unknown>)[key])
}

const pointerSegment = (segment: unknown): string => {
  const key =
    typeof segment === 'object' && segment !== null && 'key' in segment
      ? (segment as { key: unknown }).key
      : segment
  return String(key).replaceAll('~', '~0').replaceAll('/', '~1')
}

/**
 * A TypeBox failure carries its JSON Pointer as `instancePath`; a Standard
 * Schema issue (Zod, Valibot, ArkType) gives its location as an array of
 * keys, which is turned into the same pointer.
 */
const pointerOf = (failure: unknown): string => {
  const pointer = pathOf(failure, 'instancePath')
  if (pointer || typeof failure !== 'object' || failure === null) {
    return pointer
  }
  const { path } = failure as { path?: unknown }
  return Array.isArray(path) && path.length > 0
    ? `/${path.map(pointerSegment).join('/')}`
    : ''
}

/**
 * JSON Pointers to the values that failed. Elysia 1.x gives them as each
 * failure's `path`; 2.x writes a dotted `path` that cannot tell a nested
 * key from one containing a dot, and keeps the pointer on `errors`.
 */
const failedPaths = (error: { all?: unknown[]; errors?: unknown }): string[] =>
  Array.isArray(error.errors)
    ? error.errors.map(pointerOf).filter(Boolean)
    : (Array.isArray(error.all) ? error.all : [])
        .map(failure => pathOf(failure, 'path'))
        .filter(Boolean)

/**
 * Elysia 1.x puts a validation error's payload in its message; 2.x keeps it
 * on the error, so it is copied over only when the payload is wanted.
 */
const addValidationPayload = (
  safe: Record<string, unknown>,
  error: Error
): void => {
  if (isValidationErrorLike(error) && Array.isArray(error.errors)) {
    safe.found = error.value
    safe.errors = error.errors
  }
}

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
      cause instanceof Error || isStructuredError(cause) || isPlainObject(cause)
        ? normalizeLoggedError(cause, logErrorPayload, depth + 1).error
        : cause
    return safe
  }

  const statusResponse = asStatusResponse(error)
  if (statusResponse) {
    const { code, response } = statusResponse
    const message =
      typeof response === 'string' && response !== ''
        ? response
        : (STATUS_TEXT[code] ?? `HTTP ${code}`)
    return {
      error: { message, name: 'StatusResponse', status: code },
      message
    }
  }

  if (isValidationErrorLike(error) && !logErrorPayload) {
    const paths = failedPaths(error)
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
    addValidationPayload(safe, error)
    return {
      error: withCause(safe, error as unknown as Record<string, unknown>),
      message: parseError(error)
    }
  }

  if (isPlainObject(error)) {
    const message = parseError(error)
    const record: Record<string, unknown> = { ...error, message }
    // `withCause` re-adds a normalized cause; the raw one would defeat its
    // depth cap and any cycle in the chain.
    delete record.cause
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
