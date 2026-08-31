export const parseError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return error.message as string
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
  /** Safe structured representation for data/transport meta. */
  error: Record<string, unknown>
  /** Safe one-line message for the log line. */
  message: string
}

const isValidationErrorLike = (
  value: unknown
): value is Error & {
  all?: unknown[]
  status?: number
  type?: string
  value?: unknown
} =>
  value instanceof Error &&
  // `.name` and `.constructor.name` both degrade to a mangled string under
  // bundler minification (e.g. `bun build --minify`, esbuild), so a
  // minification-safe discriminant is needed too or validation bodies
  // silently re-leak in that build mode. Elysia 1.4 carried
  // `code: 'VALIDATION'`; Elysia 2 dropped `code` entirely, so its
  // `status: 422` plus the `all` failure array stand in for it.
  ((value as { code?: unknown }).code === 'VALIDATION' ||
    ((value as { status?: unknown }).status === 422 &&
      Array.isArray((value as { all?: unknown }).all)) ||
    value.name === 'ValidationError' ||
    value.constructor?.name === 'ValidationError')

/**
 * The property path of one validation failure. Elysia 1.4 put it on
 * `failure.path` (`'/password'`); Elysia 2 (TypeBox 1.x) reports `path:
 * 'root'` and keeps the useful pointer on `failure.schemaPath`
 * (`'#/properties/password'`), so that is unwrapped to the same `/password`
 * shape.
 */
const SCHEMA_PATH_FRAGMENT_PREFIX = /^#/

const failurePath = (failure: unknown): string => {
  if (typeof failure !== 'object' || failure === null) {
    return ''
  }
  const { path, schemaPath } = failure as {
    path?: unknown
    schemaPath?: unknown
  }
  if (typeof path === 'string' && path.startsWith('/')) {
    return path
  }
  if (typeof schemaPath === 'string' && schemaPath.length > 0) {
    return schemaPath
      .replace(SCHEMA_PATH_FRAGMENT_PREFIX, '')
      .replaceAll('/properties/', '/')
  }
  return typeof path === 'string' && path !== 'root' ? path : ''
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

export const normalizeLoggedError = (
  error: unknown,
  logErrorPayload: boolean
): NormalizedLoggedError => {
  if (isValidationErrorLike(error)) {
    const failures = Array.isArray(error.all) ? error.all : []
    const paths = failures.map(failurePath).filter(Boolean)
    const scope = typeof error.type === 'string' ? error.type : 'request'
    const message =
      paths.length > 0
        ? `Validation failed (${scope}): ${paths.join(', ')}`
        : `Validation failed (${scope})`
    const safe: Record<string, unknown> = {
      failedPaths: paths,
      name: 'ValidationError',
      type: scope
    }
    if (!logErrorPayload) {
      return { error: safe, message }
    }
    // Elysia 1.4 embedded the offending payload in the validation message;
    // Elysia 2's message is just the TypeBox summary, so when the user opted
    // in the rejected value is surfaced explicitly instead.
    if (error.value !== undefined) {
      safe.value = error.value
    }
    return {
      error: safe,
      message: error.message ? `${message}: ${error.message}` : message
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
    return { error: safe, message: parseError(error) }
  }

  if (isStructuredError(error)) {
    return {
      error: copyStructuredErrorFields(error as Record<string, unknown>),
      message: parseError(error)
    }
  }

  return { error: { value: String(error) }, message: parseError(error) }
}
