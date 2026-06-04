import type {
  Logger as PinoLogger,
  LoggerOptions as PinoLoggerOptions
} from 'pino'

export type Pino = PinoLogger<never, boolean>

export type RequestInfo = Request

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

export interface StoreData {
  beforeTime: bigint
}

export interface LogixlysiaStore {
  beforeTime?: bigint
  logger: Logger
  pino: Pino
}

export interface Transport {
  log: (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ) => void | Promise<void>
}

export interface LogRotationConfig {
  compress?: boolean
  compression?: 'gzip'
  /**
   * Rotate at a fixed interval, e.g. '1d', '12h'.
   */
  interval?: string
  /**
   * Keep at most N files or keep files for a duration like '7d'.
   */
  maxFiles?: number | string
  /**
   * Max log file size before rotation, e.g. '10m', '5k', or a byte count.
   */
  maxSize?: string | number
}

export interface LogFilter {
  /**
   * Array of log levels to allow. If specified, only logs with these levels will be processed.
   * If not specified, all log levels will be allowed.
   */
  level?: LogLevel[]
}

/**
 * Configuration for pino-pretty transport output.
 *
 * - `true`: Enable pretty printing with default options
 * - `false` or `undefined`: Disable pretty printing
 * - Object: Enable with custom pino-pretty options (colorize, translateTime, messageKey, errorKey, etc.)
 *
 * @see https://github.com/pinojs/pino-pretty#options
 */
export type PrettyPrintConfig = boolean | Record<string, unknown>

export type LogPreset = 'dev' | 'prod' | 'json'

export interface RequestIdConfig {
  /**
   * Enable request ID generation.
   * When used as a boolean on `Options.config.requestId`, `true` enables with defaults.
   */
  enabled?: boolean
  /**
   * Custom ID generator function.
   * @default crypto.randomUUID()
   */
  generator?: () => string
  /**
   * Header name to read from the incoming request and write to the response.
   * @default 'X-Request-Id'
   */
  header?: string
}

export interface Options {
  config?: {
    showStartupMessage?: boolean
    startupMessageFormat?: 'simple' | 'banner'
    useColors?: boolean
    ip?: boolean
    timestamp?: {
      translateTime?: string
    }
    customLogFormat?: string

    /** Service name shown in `{service}` token (e.g. evlog-style `[my-app]`). */
    service?: string
    /** Duration (ms) below this uses green; default 500. */
    slowThreshold?: number
    /** Duration (ms) at or above this uses red + `{speed}` badge; default 1000. */
    verySlowThreshold?: number
    /** Render `data.context` as tree lines under the main log line; default true. */
    showContextTree?: boolean
    /** How many object nesting levels to expand in the context tree; default 1. */
    contextDepth?: number

    /** Include query parameters in the logged URL path; default false. */
    logQueryParams?: boolean

    /** Skip automatic WebSocket lifecycle logs from `wrapWs`; default false. */
    disableWebSocketLogging?: boolean

    /**
     * Enable automatic request ID generation and propagation.
     *
     * - `true`: Enable with defaults (`X-Request-Id` header, `crypto.randomUUID()` generator).
     * - `false` or `undefined`: Disabled (default).
     * - `RequestIdConfig` object: Enable with custom header name and/or generator.
     *
     * When enabled, the plugin will:
     * 1. Read `X-Request-Id` (or custom header) from the incoming request — honoring IDs set by upstream proxies.
     * 2. Generate a new UUID if no header is present.
     * 3. Merge `{ requestId }` into the request context (appears in logs and context tree).
     * 4. Set the header on the outgoing response for client-side tracing.
     */
    requestId?: boolean | RequestIdConfig

    // Filtering
    logFilter?: LogFilter

    // Outputs
    transports?: Transport[]
    useTransportsOnly?: boolean
    disableInternalLogger?: boolean
    disableFileLogging?: boolean
    logFilePath?: string
    logRotation?: LogRotationConfig

    /**
     * Automatically redact sensitive information (PII) from logs.
     * Masks emails, IP addresses, Luhn-valid payment card numbers, and JWTs in strings and deeply nested objects.
     */
    autoRedact?: boolean

    // Pino
    pino?: (PinoLoggerOptions & { prettyPrint?: PrettyPrintConfig }) | undefined
  }
  /**
   * Opinionated defaults for common environments.
   * Explicit `config` fields override preset values.
   */
  preset?: LogPreset
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface Logger {
  debug: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
  error: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
  getContext: (key: RequestInfo | object) => Readonly<Record<string, unknown>>
  handleHttpError: (
    request: RequestInfo,
    error: unknown,
    store: StoreData
  ) => void
  info: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
  log: (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ) => void
  mergeContext: (
    key: RequestInfo | object,
    partial: Record<string, unknown>
  ) => void
  pino: Pino
  warn: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
}

export interface LogixlysiaContext {
  request: Request
  store: LogixlysiaStore
}
