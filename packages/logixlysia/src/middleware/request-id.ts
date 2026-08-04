import type { RequestIdConfig } from '../interfaces'

const DEFAULT_HEADER = 'X-Request-Id'

export interface ResolvedRequestIdConfig {
  enabled: boolean
  generator: () => string
  header: string
}

/**
 * Normalises the `requestId` option into a concrete config object.
 *
 * - `undefined` / `false` → `null` (disabled)
 * - `true` → default config
 * - `RequestIdConfig` → merged with defaults; `enabled: false` inside the object disables the feature
 */
export const resolveRequestIdConfig = (
  raw?: boolean | RequestIdConfig
): ResolvedRequestIdConfig | null => {
  if (raw === undefined || raw === false) {
    return null
  }

  if (raw === true) {
    return {
      enabled: true,
      generator: () => crypto.randomUUID(),
      header: DEFAULT_HEADER
    }
  }

  // Object form — `enabled` defaults to `true` when the object is provided
  if (raw.enabled === false) {
    return null
  }

  return {
    enabled: true,
    generator: raw.generator ?? (() => crypto.randomUUID()),
    header: raw.header?.trim() || DEFAULT_HEADER
  }
}

/**
 * Reads an existing request ID from the incoming request header, or generates a
 * new one using the configured generator.
 */
export const getOrCreateRequestId = (
  request: Request,
  config: ResolvedRequestIdConfig
): string => {
  const existing = request.headers.get(config.header)
  if (existing) {
    return existing
  }
  return config.generator()
}
