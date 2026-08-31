import {
  type AdapterTransport,
  type BatchTransportOptions,
  createHttpTransport,
  defaultBody,
  envString,
  flattenMeta,
  getPath,
  type LogEntry,
  stripTrailingSlashes,
  transportError
} from './adapters/shared'

const DEFAULT_HOST = 'https://us.i.posthog.com'
const DEFAULT_EVENT_NAME = 'logixlysia_log'
const DEFAULT_DISTINCT_ID = 'logixlysia-server'
const DEFAULT_DISTINCT_ID_FIELD = 'context.userId'

export interface PostHogTransportOptions extends BatchTransportOptions {
  /**
   * PostHog project API key (`phc_…`).
   * Falls back to the `POSTHOG_API_KEY` environment variable.
   */
  apiKey?: string
  /**
   * Static `distinct_id` used when {@link distinctIdField} resolves to
   * nothing — e.g. a service name for a backend acting as one identity.
   * @default 'logixlysia-server'
   */
  distinctId?: string
  /**
   * Dot-notation meta path resolved per log to the event's `distinct_id`,
   * linking logs to PostHog persons. Populate it via
   * `log.mergeContext({ userId })`.
   * @default 'context.userId'
   */
  distinctIdField?: string
  /**
   * Name of the captured event.
   * @default 'logixlysia_log'
   */
  eventName?: string
  /**
   * PostHog instance URL: `https://us.i.posthog.com` (US),
   * `https://eu.i.posthog.com` (EU), or a self-hosted instance.
   * Falls back to `POSTHOG_HOST`.
   * @default 'https://us.i.posthog.com'
   */
  host?: string
}

/**
 * Creates a transport that captures logs as PostHog events via the batch API.
 * Meta fields become dot-notation event properties (`request.method`,
 * `context.requestId`, …) usable in filters, insights, and cohorts. Logs
 * carrying a `userId` in the request context are linked to PostHog persons.
 *
 * @throws When no API key is configured.
 */
export const createPostHogTransport = (
  options: PostHogTransportOptions = {}
): AdapterTransport => {
  const apiKey = options.apiKey ?? envString('POSTHOG_API_KEY')
  if (!apiKey) {
    throw transportError(
      'PostHog',
      'missing API key. Set POSTHOG_API_KEY or pass apiKey to createPostHogTransport()'
    )
  }
  const host = stripTrailingSlashes(
    options.host ?? envString('POSTHOG_HOST') ?? DEFAULT_HOST
  )
  const eventName = options.eventName ?? DEFAULT_EVENT_NAME
  const distinctId = options.distinctId ?? DEFAULT_DISTINCT_ID
  const distinctIdField = options.distinctIdField ?? DEFAULT_DISTINCT_ID_FIELD

  const distinctIdFor = (entry: LogEntry): string => {
    const resolved = getPath(entry.meta, distinctIdField)
    if (typeof resolved === 'string' && resolved.length > 0) {
      return resolved
    }
    if (typeof resolved === 'number') {
      return String(resolved)
    }
    return distinctId
  }

  return createHttpTransport({
    body: entries =>
      JSON.stringify({
        api_key: apiKey,
        batch: entries.map(entry => ({
          distinct_id: distinctIdFor(entry),
          event: eventName,
          // Meta first so level/message always win on collision.
          properties: {
            ...flattenMeta(entry.meta),
            level: entry.level,
            message: defaultBody(entry)
          },
          timestamp: entry.timestamp.toISOString()
        }))
      }),
    headers: { 'Content-Type': 'application/json' },
    name: 'PostHog',
    options,
    url: `${host}/batch/`
  })
}

export type { AdapterTransport } from './adapters/shared'
