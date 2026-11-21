import { asStatusResponse } from '../helpers/status'
import { REDACTED_TEXT } from './redact'
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

const textOf = (failure: unknown, key: string): string => {
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
  const pointer = textOf(failure, 'instancePath')
  if (pointer || typeof failure !== 'object' || failure === null) {
    return pointer
  }
  const { path } = failure as { path?: unknown }
  return Array.isArray(path) && path.length > 0
    ? `/${path.map(pointerSegment).join('/')}`
    : ''
}

interface ValidationFailure {
  message?: string
  path: string
}

/**
 * Each failure's JSON Pointer and, when wanted, its message. Elysia 1.x gives
 * the pointer as a failure's `path`; 2.x writes a dotted `path` that cannot
 * tell a nested key from one containing a dot, and keeps the pointer on
 * `errors`. A failure also carries the value that failed (1.x in `value` and
 * in some summaries, Standard Schema issues in `input`), under a name the
 * `autoRedact` key rule cannot tie to the field, so nothing else is kept.
 * A message is the validator's free text and can quote any submitted value,
 * whatever the failure's path says, so `maskMessages` replaces every one.
 * `all` is read once: on 1.x it runs the validator again.
 */
const validationFailures = (
  error: { all?: unknown[]; errors?: unknown },
  withMessages: boolean,
  maskMessages: boolean
): ValidationFailure[] => {
  const { errors } = error
  const fromErrors = Array.isArray(errors)
  const list = fromErrors ? errors : error.all
  return (Array.isArray(list) ? list : []).map(failure => {
    const path = fromErrors ? pointerOf(failure) : textOf(failure, 'path')
    if (!withMessages) {
      return { path }
    }
    return {
      message: maskMessages ? REDACTED_TEXT : textOf(failure, 'message'),
      path
    }
  })
}

// Reading the failures can run the validator again, and a failure's fields
// can throw; neither may cost the log line.
const readValidationFailures = (
  error: { all?: unknown[]; errors?: unknown },
  withMessages: boolean,
  maskMessages: boolean
): ValidationFailure[] => {
  try {
    return validationFailures(error, withMessages, maskMessages)
  } catch {
    return []
  }
}

const readSubmittedValue = (error: { value?: unknown }): unknown => {
  try {
    return error.value
  } catch {
    return undefined
  }
}

const readValidationScope = (error: unknown): string => {
  try {
    const { type } = error as { type?: unknown }
    return typeof type === 'string' ? type : 'request'
  } catch {
    return 'request'
  }
}

// An error is only given the payload fields when it carries validation data;
// an application error that merely has `code: 'VALIDATION'` keeps its own
// message. `in` does not run Elysia 1.x's `all` getter.
const carriesValidationData = (error: {
  all?: unknown[]
  errors?: unknown
}): boolean => 'all' in error || Array.isArray(error.errors)

interface ValidationRecord {
  failures: ValidationFailure[]
  found: unknown
  scope: string
}

/**
 * Everything the summary needs from a validation error, or `undefined` when
 * the error takes the generic path. Whatever throws while deciding or reading
 * leaves the summary with no failures and no value.
 */
const readValidationRecord = (
  error: unknown,
  logErrorPayload: boolean,
  maskMessages: boolean
): ValidationRecord | undefined => {
  try {
    if (!isValidationErrorLike(error)) {
      return undefined
    }
    if (logErrorPayload && !carriesValidationData(error)) {
      return undefined
    }
    return {
      failures: readValidationFailures(error, logErrorPayload, maskMessages),
      found: logErrorPayload ? readSubmittedValue(error) : undefined,
      scope: readValidationScope(error)
    }
  } catch {
    return {
      failures: [],
      found: undefined,
      scope: readValidationScope(error)
    }
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
  maskFailureMessages = false,
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
        ? normalizeLoggedError(
            cause,
            logErrorPayload,
            maskFailureMessages,
            depth + 1
          ).error
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

  // Elysia 1.x writes the submitted value into a validation error's message,
  // so that message is never logged. The value goes in `found` instead, where
  // `autoRedact` masks its sensitive keys.
  const validation = readValidationRecord(
    error,
    logErrorPayload,
    maskFailureMessages
  )
  if (validation) {
    const { failures, found, scope } = validation
    const paths = failures.map(failure => failure.path).filter(Boolean)
    const message =
      paths.length > 0
        ? `Validation failed (${scope}): ${paths.join(', ')}`
        : `Validation failed (${scope})`
    const logged: Record<string, unknown> = {
      failedPaths: paths,
      message,
      name: 'ValidationError',
      type: scope
    }
    if (logErrorPayload) {
      logged.found = found
      logged.errors = failures
    }
    return { error: logged, message }
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
