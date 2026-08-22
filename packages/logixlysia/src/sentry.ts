import {
  type AdapterTransport,
  type BatchTransportOptions,
  createHttpTransport,
  defaultBody,
  envString,
  type FlatValue,
  flattenMeta,
  getPath,
  type LogEntry,
  transportError
} from './adapters/shared'
import type { LogLevel } from './interfaces'

const MILLIS_PER_SECOND = 1000
const TRACE_ID_BYTES = 16
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i

export interface SentryTransportOptions extends BatchTransportOptions {
  /**
   * Sentry DSN (`https://<public-key>@<host>/<project-id>`).
   * Falls back to the `SENTRY_DSN` environment variable.
   */
  dsn?: string
  /**
   * Value of the `sentry.environment` attribute.
   * Falls back to `SENTRY_ENVIRONMENT`.
   */
  environment?: string
  /**
   * Value of the `sentry.release` attribute.
   * Falls back to `SENTRY_RELEASE`.
   */
  release?: string
  /** Extra searchable attributes added to every log. */
  tags?: Record<string, string>
}

const SENTRY_LEVEL: Record<LogLevel, string> = {
  DEBUG: 'debug',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warn'
}

interface SentryAttribute {
  type: 'boolean' | 'double' | 'integer' | 'string'
  value: boolean | number | string
}

const toSentryAttribute = (value: FlatValue): SentryAttribute => {
  if (typeof value === 'boolean') {
    return { type: 'boolean', value }
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value }
      : { type: 'double', value }
  }
  return { type: 'string', value }
}

const randomTraceId = (): string => {
  const bytes = new Uint8Array(TRACE_ID_BYTES)
  crypto.getRandomValues(bytes)
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

const traceIdFor = (entry: LogEntry): string => {
  const fromContext = getPath(entry.meta, 'context.trace_id')
  if (typeof fromContext === 'string' && TRACE_ID_PATTERN.test(fromContext)) {
    return fromContext.toLowerCase()
  }
  return randomTraceId()
}

interface ParsedDsn {
  envelopeUrl: string
  publicKey: string
}

// URL.canParse is missing on Node.js < 18.17, which this package still supports.
const tryParseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value)
  } catch {
    // Malformed URL: fall through to undefined so parseDsn reports the DSN.
  }
}

const parseDsn = (dsn: string): ParsedDsn => {
  const url = tryParseUrl(dsn)
  const segments = url?.pathname.split('/').filter(Boolean) ?? []
  const projectId = segments.at(-1)
  if (!(url?.username && projectId)) {
    throw transportError(
      'Sentry',
      `invalid DSN. Expected https://<public-key>@<host>/<project-id>, got '${dsn}'`
    )
  }
  const pathPrefix = segments.slice(0, -1).join('/')
  return {
    envelopeUrl: `${url.protocol}//${url.host}${
      pathPrefix ? `/${pathPrefix}` : ''
    }/api/${projectId}/envelope/`,
    publicKey: url.username
  }
}

/**
 * Creates a transport that ships logs to Sentry's structured logs
 * (Explore > Logs) via the envelope endpoint. Every meta field becomes a
 * typed, searchable attribute; `trace_id` from the request context (as set by
 * `logixlysia/otel`) links logs to traces.
 *
 * @throws When no DSN is configured or the DSN is malformed.
 */
export const createSentryTransport = (
  options: SentryTransportOptions = {}
): AdapterTransport => {
  const dsn = options.dsn ?? envString('SENTRY_DSN')
  if (!dsn) {
    throw transportError(
      'Sentry',
      'missing DSN. Set SENTRY_DSN or pass dsn to createSentryTransport()'
    )
  }
  const { envelopeUrl, publicKey } = parseDsn(dsn)
  const environment = options.environment ?? envString('SENTRY_ENVIRONMENT')
  const release = options.release ?? envString('SENTRY_RELEASE')

  const staticAttributes: Record<string, SentryAttribute> = {}
  if (environment) {
    staticAttributes['sentry.environment'] = toSentryAttribute(environment)
  }
  if (release) {
    staticAttributes['sentry.release'] = toSentryAttribute(release)
  }
  for (const [key, value] of Object.entries(options.tags ?? {})) {
    staticAttributes[key] = toSentryAttribute(value)
  }

  const envelope = (entries: LogEntry[]): string => {
    const items = entries.map(entry => {
      const attributes: Record<string, SentryAttribute> = {
        ...staticAttributes
      }
      for (const [key, value] of Object.entries(flattenMeta(entry.meta))) {
        attributes[key] = toSentryAttribute(value)
      }
      return {
        attributes,
        body: defaultBody(entry),
        level: SENTRY_LEVEL[entry.level],
        timestamp: entry.timestamp.getTime() / MILLIS_PER_SECOND,
        trace_id: traceIdFor(entry)
      }
    })
    return [
      JSON.stringify({ dsn, sent_at: new Date().toISOString() }),
      JSON.stringify({
        content_type: 'application/vnd.sentry.items.log+json',
        item_count: items.length,
        type: 'log'
      }),
      JSON.stringify({ items })
    ].join('\n')
  }

  return createHttpTransport({
    body: envelope,
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=logixlysia, sentry_key=${publicKey}`
    },
    name: 'Sentry',
    options,
    url: envelopeUrl
  })
}

export type { AdapterTransport } from './adapters/shared'
