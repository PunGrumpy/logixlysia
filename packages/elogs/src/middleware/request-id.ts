import type { RequestIdConfig } from "../interfaces";

const DEFAULT_HEADER = "X-Request-Id";
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** @internal */
export interface ResolvedRequestIdConfig {
  enabled: boolean;
  generator: () => string;
  header: string;
}

/**
 * Normalises the `requestId` option into a concrete config object.
 *
 * - `undefined` / `false` → `null` (disabled)
 * - `true` → default config
 * - `RequestIdConfig` → merged with defaults; `enabled: false` inside the object disables the feature
 * @internal
 */
export const resolveRequestIdConfig = (
  raw?: boolean | RequestIdConfig
): ResolvedRequestIdConfig | null => {
  if (raw === undefined || raw === false) {
    return null;
  }

  if (raw === true) {
    return {
      enabled: true,
      generator: () => crypto.randomUUID(),
      header: DEFAULT_HEADER,
    };
  }

  // Object form — `enabled` defaults to `true` when the object is provided
  if (raw.enabled === false) {
    return null;
  }

  return {
    enabled: true,
    generator: raw.generator ?? (() => crypto.randomUUID()),
    header: raw.header?.trim() || DEFAULT_HEADER,
  };
};

/**
 * Reads an existing request ID from the incoming request header, or generates a
 * new one using the configured generator.
 *
 * Inbound values are validated against `VALID_REQUEST_ID` (alphanumeric plus
 * `.`, `_`, `-`, 1-128 chars) before being trusted — request IDs flow into log
 * lines, response headers, and context trees, so malformed or oversized
 * values are replaced with a freshly generated one rather than echoed back.
 * @internal
 */
export const getOrCreateRequestId = (
  request: Request,
  config: ResolvedRequestIdConfig
): string => {
  const existing = request.headers.get(config.header);
  if (existing && VALID_REQUEST_ID.test(existing)) {
    return existing;
  }
  return config.generator();
};
