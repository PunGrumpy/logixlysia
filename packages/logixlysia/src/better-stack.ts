import {
  type AdapterTransport,
  type BatchTransportOptions,
  createHttpTransport,
  defaultBody,
  envString,
  stripTrailingSlashes,
  transportError
} from './adapters/shared'

const DEFAULT_ENDPOINT = 'https://in.logs.betterstack.com'

export interface BetterStackTransportOptions extends BatchTransportOptions {
  /**
   * Ingesting URL shown next to the source token — newer sources get a
   * dedicated host like `https://s123456.eu-nbg-2.betterstackdata.com`.
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
 * @throws When no source token is configured.
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
      JSON.stringify(
        // Meta first so the adapter-owned fields below always win on collision.
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
      options.endpoint ??
        envString('BETTER_STACK_INGESTING_HOST') ??
        DEFAULT_ENDPOINT
    )
  })
}

export type { AdapterTransport } from './adapters/shared'
