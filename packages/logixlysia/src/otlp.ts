import { createOtlpCore } from './adapters/otlp-core'
import {
  type AdapterTransport,
  type BatchTransportOptions,
  envString,
  stripTrailingSlashes,
  transportError
} from './adapters/shared'

const LOGS_PATH = '/v1/logs'

/** W3C Baggage values are percent-encoded; keep the raw value if decoding fails. */
const decodeHeaderValue = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Parses the standard `OTEL_EXPORTER_OTLP_HEADERS` format (`k=v,k2=v2`,
 * W3C Baggage): split on the first `=`, percent-decode values, allow empty
 * values.
 */
const parseHeadersEnv = (raw: string): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const separator = pair.indexOf('=')
    if (separator <= 0) {
      continue
    }
    const key = pair.slice(0, separator).trim()
    if (key) {
      headers[key] = decodeHeaderValue(pair.slice(separator + 1).trim())
    }
  }
  return headers
}

export interface OtlpTransportOptions extends BatchTransportOptions {
  /**
   * OTLP HTTP base URL — the adapter appends `/v1/logs`. For a local
   * collector this is typically `http://localhost:4318`.
   * Falls back to `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` (used as-is, per the
   * OpenTelemetry spec), then `OTEL_EXPORTER_OTLP_ENDPOINT` (with `/v1/logs`
   * appended).
   */
  endpoint?: string
  /**
   * Extra request headers, e.g. vendor auth. Merged over headers parsed from
   * `OTEL_EXPORTER_OTLP_LOGS_HEADERS`, then `OTEL_EXPORTER_OTLP_HEADERS`
   * (`k=v,k2=v2`).
   */
  headers?: Record<string, string>
  /** Extra OTLP resource attributes merged next to `service.name`. */
  resourceAttributes?: Record<string, string>
  /**
   * Value of the `service.name` resource attribute.
   * Falls back to `OTEL_SERVICE_NAME`.
   * @default 'logixlysia'
   */
  serviceName?: string
}

/**
 * Resolves the logs URL with the spec's precedence: an explicit option, then
 * the signal-specific endpoint (used as-is), then the generic endpoint (with
 * the logs path appended).
 */
const resolveLogsUrl = (endpointOption: string | undefined): string => {
  if (endpointOption) {
    return `${stripTrailingSlashes(endpointOption)}${LOGS_PATH}`
  }
  const logsEndpoint = envString('OTEL_EXPORTER_OTLP_LOGS_ENDPOINT')
  if (logsEndpoint) {
    return logsEndpoint
  }
  const genericEndpoint = envString('OTEL_EXPORTER_OTLP_ENDPOINT')
  if (genericEndpoint) {
    return `${stripTrailingSlashes(genericEndpoint)}${LOGS_PATH}`
  }
  throw transportError(
    'OTLP',
    'missing endpoint. Set OTEL_EXPORTER_OTLP_ENDPOINT (or OTEL_EXPORTER_OTLP_LOGS_ENDPOINT) or pass endpoint to createOtlpTransport()'
  )
}

/**
 * Creates a transport that ships logs to any OTLP/HTTP logs endpoint as JSON
 * (`ExportLogsServiceRequest`) — OpenTelemetry Collectors, Grafana Cloud,
 * New Relic, Honeycomb, SigNoz, and every other OTLP-compatible backend.
 * Meta fields become dot-notation log attributes (`request.method`,
 * `context.requestId`, …).
 *
 * @throws When no endpoint is configured.
 */
export const createOtlpTransport = (
  options: OtlpTransportOptions = {}
): AdapterTransport => {
  const headersEnv =
    envString('OTEL_EXPORTER_OTLP_LOGS_HEADERS') ??
    envString('OTEL_EXPORTER_OTLP_HEADERS')

  return createOtlpCore({
    headers: {
      ...(headersEnv ? parseHeadersEnv(headersEnv) : {}),
      ...options.headers
    },
    name: 'OTLP',
    options,
    resourceAttributes: options.resourceAttributes ?? {},
    serviceName:
      options.serviceName ?? envString('OTEL_SERVICE_NAME') ?? 'logixlysia',
    url: resolveLogsUrl(options.endpoint)
  })
}

export type { AdapterTransport } from './adapters/shared'
