import {
  type AdapterTransport,
  type BatchTransportOptions,
  createHttpTransport,
  defaultBody,
  envString,
  flattenMeta,
  type LogEntry,
  stripTrailingSlashes,
  transportError
} from './adapters/shared'

const DEFAULT_URL = 'http://localhost:8123'
const DEFAULT_DATABASE = 'default'
const DEFAULT_TABLE = 'logs'
const IDENTIFIER = /^[A-Za-z0-9_]+$/

export interface ClickHouseTransportOptions extends BatchTransportOptions {
  /**
   * Target database.
   * Falls back to `CLICKHOUSE_DATABASE`.
   * @default 'default'
   */
  database?: string
  /**
   * Password, sent as the `X-ClickHouse-Key` header.
   * Falls back to `CLICKHOUSE_PASSWORD`.
   */
  password?: string
  /**
   * Target table. Expected columns: `timestamp DateTime64(3)`,
   * `level LowCardinality(String)`, `message String`,
   * `attributes Map(String, String)`.
   * Falls back to `CLICKHOUSE_TABLE`.
   * @default 'logs'
   */
  table?: string
  /**
   * ClickHouse HTTP interface base URL.
   * Falls back to `CLICKHOUSE_URL`.
   * @default 'http://localhost:8123'
   */
  url?: string
  /**
   * Username, sent as the `X-ClickHouse-User` header.
   * Falls back to `CLICKHOUSE_USERNAME`.
   */
  username?: string
}

const validIdentifier = (value: string, kind: string): string => {
  if (!IDENTIFIER.test(value)) {
    throw transportError(
      'ClickHouse',
      `invalid ${kind} '${value}'. Only letters, digits, and underscores are allowed`
    )
  }
  return value
}

const toRow = (entry: LogEntry): string => {
  const attributes: Record<string, string> = {}
  for (const [key, value] of Object.entries(flattenMeta(entry.meta))) {
    attributes[key] = String(value)
  }
  return JSON.stringify({
    attributes,
    level: entry.level,
    message: defaultBody(entry),
    timestamp: entry.timestamp.toISOString()
  })
}

/**
 * Creates a transport that inserts logs into a ClickHouse table over the HTTP
 * interface using `JSONEachRow`. Rows carry `timestamp`, `level`, `message`,
 * and an `attributes` map of the flattened meta (`request.method`,
 * `context.requestId`, …) with values rendered as strings.
 *
 * @throws When the database or table name is not a plain identifier.
 */
export const createClickHouseTransport = (
  options: ClickHouseTransportOptions = {}
): AdapterTransport => {
  const baseUrl = stripTrailingSlashes(
    options.url ?? envString('CLICKHOUSE_URL') ?? DEFAULT_URL
  )
  const database = validIdentifier(
    options.database ?? envString('CLICKHOUSE_DATABASE') ?? DEFAULT_DATABASE,
    'database'
  )
  const table = validIdentifier(
    options.table ?? envString('CLICKHOUSE_TABLE') ?? DEFAULT_TABLE,
    'table'
  )
  const username = options.username ?? envString('CLICKHOUSE_USERNAME')
  const password = options.password ?? envString('CLICKHOUSE_PASSWORD')

  const query = new URLSearchParams({
    date_time_input_format: 'best_effort',
    query: `INSERT INTO ${database}.${table} FORMAT JSONEachRow`
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (username) {
    headers['X-ClickHouse-User'] = username
  }
  if (password) {
    headers['X-ClickHouse-Key'] = password
  }

  return createHttpTransport({
    body: entries => entries.map(toRow).join('\n'),
    headers,
    name: 'ClickHouse',
    options,
    url: `${baseUrl}/?${query.toString()}`
  })
}

export type { AdapterTransport } from './adapters/shared'
