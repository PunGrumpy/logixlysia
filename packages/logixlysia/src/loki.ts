import {
  type AdapterTransport,
  type BatchTransportOptions,
  createHttpTransport,
  defaultBody,
  envString,
  type LogEntry,
  stripTrailingSlashes,
  toUnixNanos,
  transportError
} from './adapters/shared'
import type { LogLevel } from './interfaces'

export interface LokiTransportOptions extends BatchTransportOptions {
  /**
   * Extra static stream labels. Keep these low-cardinality — per-request
   * values belong in the log line, not in labels.
   */
  labels?: Record<string, string>
  /**
   * Basic-auth password or API token (Grafana Cloud).
   * Falls back to `LOKI_PASSWORD`.
   */
  password?: string
  /**
   * Value of the `service_name` stream label.
   * Falls back to `LOKI_SERVICE_NAME`, then `OTEL_SERVICE_NAME`.
   * @default 'logixlysia'
   */
  serviceName?: string
  /**
   * Tenant ID sent as the `X-Scope-OrgID` header (multi-tenant Loki).
   * Falls back to `LOKI_TENANT_ID`.
   */
  tenantId?: string
  /**
   * Loki base URL, e.g. `http://localhost:3100` or a Grafana Cloud push URL
   * base. The adapter appends `/loki/api/v1/push`.
   * Falls back to the `LOKI_URL` environment variable.
   */
  url?: string
  /**
   * Basic-auth username (Grafana Cloud instance ID).
   * Falls back to `LOKI_USERNAME`.
   */
  username?: string
}

/**
 * Creates a transport that pushes logs to Grafana Loki. Streams are labeled
 * with `service_name` and `level` (plus your static labels); the log line is
 * the message and full meta object as JSON, ready for LogQL's `| json`.
 *
 * @throws When no URL is configured.
 */
export const createLokiTransport = (
  options: LokiTransportOptions = {}
): AdapterTransport => {
  const rawUrl = options.url ?? envString('LOKI_URL')
  if (!rawUrl) {
    throw transportError(
      'Loki',
      'missing URL. Set LOKI_URL or pass url to createLokiTransport()'
    )
  }
  const serviceName =
    options.serviceName ??
    envString('LOKI_SERVICE_NAME') ??
    envString('OTEL_SERVICE_NAME') ??
    'logixlysia'
  const username = options.username ?? envString('LOKI_USERNAME')
  const password = options.password ?? envString('LOKI_PASSWORD')
  const tenantId = options.tenantId ?? envString('LOKI_TENANT_ID')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (username && password) {
    headers.Authorization = `Basic ${Buffer.from(
      `${username}:${password}`
    ).toString('base64')}`
  }
  if (tenantId) {
    headers['X-Scope-OrgID'] = tenantId
  }

  const body = (entries: LogEntry[]): string => {
    const byLevel = new Map<LogLevel, LogEntry[]>()
    for (const entry of entries) {
      const bucket = byLevel.get(entry.level)
      if (bucket) {
        bucket.push(entry)
      } else {
        byLevel.set(entry.level, [entry])
      }
    }

    const streams = [...byLevel.entries()].map(([level, levelEntries]) => ({
      stream: {
        ...options.labels,
        level,
        service_name: serviceName
      },
      values: levelEntries.map(entry => [
        toUnixNanos(entry.timestamp),
        JSON.stringify({ ...entry.meta, message: defaultBody(entry) })
      ])
    }))

    return JSON.stringify({ streams })
  }

  return createHttpTransport({
    body,
    headers,
    name: 'Loki',
    options,
    url: `${stripTrailingSlashes(rawUrl)}/loki/api/v1/push`
  })
}

export type { AdapterTransport } from './adapters/shared'
