import {
  createHttpTransport,
  defaultBody,
  envString,
  stripTrailingSlashes,
  transportError,
  tryParseUrl
} from './adapters/shared'
import type { AdapterTransport, BatchTransportOptions } from './adapters/shared'
import { stringifyForLog } from './utils/json'

const DEFAULT_ENDPOINT = 'https://in.logs.betterstack.com'
const LOOKS_LIKE_HOST = /^[a-z0-9][a-z0-9.-]*(?::\d+)?(?:\/.*)?$/iu

const withScheme = (endpoint: string): string => {
  const protocol = tryParseUrl(endpoint)?.protocol
  if (protocol === 'http:' || protocol === 'https:') {
    return endpoint
  }
  const trimmed = endpoint.trim()
  return LOOKS_LIKE_HOST.test(trimmed) ? `https://${trimmed}` : endpoint
}

export interface BetterStackTransportOptions extends BatchTransportOptions {
  /**
   * Ingesting host or URL shown next to the source token — newer sources get
   * a dedicated host like `s123456.eu-nbg-2.betterstackdata.com`. A host
   * without a scheme is sent over `https`.
   * Falls back to `BETTER_STACK_INGESTING_HOST`.
   * @default 'https://in.logs.betterstack.com'
   */
  endpoint?: string
  /**
   * Source token from the Better Stack source settings, sent as a Bearer
   * token. Falls back to the `BETTER_STACK_SOURCE_TOKEN` environment variable.
   */
  sourceToken?: string
}

/**
 * Creates a transport that ships logs to Better Stack (Telemetry / Logs).
 * Each log posts as JSON with a `dt` timestamp, `level`, `message`, and the
 * full meta object — all queryable in Live tail and SQL.
 *
 * @throws {Error} When no source token is configured.
 */
export const createBetterStackTransport = (
  options: BetterStackTransportOptions = {}
): AdapterTransport => {
  const sourceToken =
    options.sourceToken ?? envString('BETTER_STACK_SOURCE_TOKEN')
  if (!sourceToken) {
    throw transportError(
      'Better Stack',
      'missing source token. Set BETTER_STACK_SOURCE_TOKEN or pass sourceToken to createBetterStackTransport()'
    )
  }

  return createHttpTransport({
    body: entries =>
      stringifyForLog(
        entries.map(entry => ({
          ...entry.meta,
          dt: entry.timestamp.toISOString(),
          level: entry.level,
          message: defaultBody(entry)
        }))
      ),
    headers: {
      Authorization: `Bearer ${sourceToken}`,
      'Content-Type': 'application/json'
    },
    name: 'Better Stack',
    options,
    url: stripTrailingSlashes(
      withScheme(
        options.endpoint ??
          envString('BETTER_STACK_INGESTING_HOST') ??
          DEFAULT_ENDPOINT
      )
    )
  })
}

export type { AdapterTransport } from './adapters/shared'
