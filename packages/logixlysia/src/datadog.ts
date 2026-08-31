import {
  type AdapterTransport,
  type BatchTransportOptions,
  createHttpTransport,
  defaultBody,
  envString,
  type LogEntry,
  transportError
} from './adapters/shared'

const DEFAULT_SITE = 'datadoghq.com'
const DEFAULT_SOURCE = 'logixlysia'

export interface DatadogTransportOptions extends BatchTransportOptions {
  /**
   * Datadog API key, sent as the `DD-API-KEY` header.
   * Falls back to the `DD_API_KEY` environment variable.
   */
  apiKey?: string
  /**
   * Hostname reported with each log.
   * Falls back to `DD_HOSTNAME`; omitted when unset.
   */
  hostname?: string
  /**
   * `service` facet on each log.
   * Falls back to `DD_SERVICE`.
   * @default 'logixlysia'
   */
  service?: string
  /**
   * Datadog site: `datadoghq.com` (US1), `datadoghq.eu` (EU),
   * `us3.datadoghq.com`, `us5.datadoghq.com`, `ap1.datadoghq.com`, …
   * Falls back to `DD_SITE`.
   * @default 'datadoghq.com'
   */
  site?: string
  /** `ddsource` facet on each log. @default 'logixlysia' */
  source?: string
  /** Tags rendered into `ddtags` as `key:value,key2:value2`. */
  tags?: Record<string, string>
}

/**
 * Creates a transport that ships logs to Datadog via the v2 logs intake API.
 * The log level lands in the `status` attribute (Datadog's default status
 * remapper), and the full meta object rides along as searchable attributes.
 *
 * @throws When no API key is configured.
 */
export const createDatadogTransport = (
  options: DatadogTransportOptions = {}
): AdapterTransport => {
  const apiKey = options.apiKey ?? envString('DD_API_KEY')
  if (!apiKey) {
    throw transportError(
      'Datadog',
      'missing API key. Set DD_API_KEY or pass apiKey to createDatadogTransport()'
    )
  }
  const site = options.site ?? envString('DD_SITE') ?? DEFAULT_SITE
  const service = options.service ?? envString('DD_SERVICE') ?? DEFAULT_SOURCE
  const hostname = options.hostname ?? envString('DD_HOSTNAME')
  const source = options.source ?? DEFAULT_SOURCE
  const ddtags = Object.entries(options.tags ?? {})
    .map(([key, value]) => `${key}:${value}`)
    .join(',')

  const toEvent = (entry: LogEntry): Record<string, unknown> => {
    // Meta first so the adapter-owned facets below always win — access-log
    // meta carries an HTTP `status` that must not clobber Datadog's status.
    const event: Record<string, unknown> = {
      ...entry.meta,
      ddsource: source,
      message: defaultBody(entry),
      service,
      status: entry.level.toLowerCase(),
      timestamp: entry.timestamp.toISOString()
    }
    if (ddtags) {
      event.ddtags = ddtags
    }
    if (hostname) {
      event.hostname = hostname
    }
    if (typeof entry.meta.status === 'number') {
      event.http = { status_code: entry.meta.status }
    }
    return event
  }

  return createHttpTransport({
    body: entries => JSON.stringify(entries.map(toEvent)),
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': apiKey
    },
    name: 'Datadog',
    options,
    url: `https://http-intake.logs.${site}/api/v2/logs`
  })
}

export type { AdapterTransport } from './adapters/shared'
