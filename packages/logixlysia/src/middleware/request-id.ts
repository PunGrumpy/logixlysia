import type { RequestIdConfig, SinkErrorContext } from '../interfaces'
import { createErrorReporter } from '../utils/report'

const DEFAULT_HEADER = 'X-Request-Id'
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/u
const REPORTED_ID_MAX = 64

const reportGeneratorError = createErrorReporter(
  'enricher',
  'request id generator failed'
)

export interface ResolvedRequestIdConfig {
  enabled: boolean
  generator: () => string
  header: string
  onError?: (context: SinkErrorContext) => void
}

/**
 * Normalises the `requestId` option into a concrete config object.
 *
 * - `undefined` / `false` → `null` (disabled)
 * - `true` → default config
 * - `RequestIdConfig` → merged with defaults; `enabled: false` inside the object disables the feature
 */
export const resolveRequestIdConfig = (
  raw?: boolean | RequestIdConfig,
  onError?: (context: SinkErrorContext) => void
): ResolvedRequestIdConfig | null => {
  if (raw === undefined || raw === false) {
    return null
  }

  if (raw === true) {
    return {
      enabled: true,
      generator: () => crypto.randomUUID(),
      header: DEFAULT_HEADER,
      onError
    }
  }

  // Object form — `enabled` defaults to `true` when the object is provided
  if (raw.enabled === false) {
    return null
  }

  return {
    enabled: true,
    generator: raw.generator ?? (() => crypto.randomUUID()),
    header: raw.header?.trim() || DEFAULT_HEADER,
    onError
  }
}

/**
 * Reads an existing request ID from the incoming request header, or generates a
 * new one using the configured generator.
 *
 * Inbound values are validated against `VALID_REQUEST_ID` (alphanumeric plus
 * `.`, `_`, `-`, 1-128 chars) before being trusted — request IDs flow into log
 * lines, response headers, and context trees, so malformed or oversized
 * values are replaced with a freshly generated one rather than echoed back.
 *
 * Generated values must pass the same check. This runs in `onRequest`, where
 * a throw would log an error for every request, so a generator that throws
 * or returns an invalid id is reported and replaced with a random UUID.
 */
export const getOrCreateRequestId = (
  request: Request,
  config: ResolvedRequestIdConfig
): string => {
  const existing = request.headers.get(config.header)
  if (existing && VALID_REQUEST_ID.test(existing)) {
    return existing
  }

  try {
    const generated: unknown = config.generator()
    if (typeof generated === 'string' && VALID_REQUEST_ID.test(generated)) {
      return generated
    }
    reportGeneratorError(
      new Error(
        `generated request id is not valid: ${String(generated).slice(0, REPORTED_ID_MAX)}`
      ),
      config.onError
    )
  } catch (error) {
    reportGeneratorError(error, config.onError)
  }
  return crypto.randomUUID()
}
