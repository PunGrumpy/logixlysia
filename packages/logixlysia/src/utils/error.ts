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
  // `code` is Elysia's minification-safe discriminant — `.name` and
  // `.constructor.name` both degrade to a mangled string under bundler
  // minification (e.g. `bun build --minify`, esbuild), so `code` must be
  // checked too or validation bodies silently re-leak in that build mode.
  ((value as { code?: unknown }).code === 'validation' ||
    value.name === 'ValidationError' ||
    value.constructor?.name === 'ValidationError')

const SCHEMA_PATH_FRAGMENT_PREFIX = /^#/u

/**
 * The property paths one validation failure points at. TypeBox 1.x reports
 * every failure at `path: 'root'` and puts the property on `schemaPath`
 * (`'#/properties/password'`), which this turns into `/password`. A missing
 * property is one failure on the parent object, and `params.requiredProperties`
 * names every absent key.
 */
const failurePaths = (failure: unknown): string[] => {
  if (typeof failure !== 'object' || failure === null) {
    return []
  }
  const { params, schemaPath } = failure as {
    params?: { requiredProperties?: unknown }
    schemaPath?: unknown
  }
  if (typeof schemaPath !== 'string') {
    return []
  }
  const base = schemaPath
    .replace(SCHEMA_PATH_FRAGMENT_PREFIX, '')
    .replaceAll('/properties/', '/')
  const required = params?.requiredProperties
  if (Array.isArray(required) && required.length > 0) {
    return required.map(key => `${base}/${String(key)}`)
  }
  return base ? [base] : []
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
    const paths = failures.flatMap(failurePaths)
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
