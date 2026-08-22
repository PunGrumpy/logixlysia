import type { LoggerOptions as PinoLoggerOptions } from 'pino'
import type { LogLevel } from './core'
import type { Enricher, EnricherLike } from './enricher'

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
   * Rotate when the live file's age reaches a fixed interval, evaluated on
   * write (an idle process rotates on its next write, not on a timer).
   * Format: number + 'h' | 'd' | 'w', e.g. '12h', '1d', '1w'.
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
 * Percentage of records to keep per level, `0`–`100`. Levels left out keep
 * everything, so `{ INFO: 10 }` thins access logs while every `ERROR` still
 * reaches the sinks.
 */
export type HeadSamplingConfig = Partial<Record<LogLevel, number>>

/**
 * Conditions that rescue a request's head-dropped records once its outcome is
 * known. Rules are OR-ed: any single match replays the whole request.
 */
export interface TailSamplingConfig {
  /** Rescue when the request took at least this many milliseconds. */
  durationMs?: number
  /**
   * Rescue when the request pathname matches one of these globs.
   * `**` crosses `/`, `*` and `?` do not — e.g. `/checkout/**`.
   */
  paths?: string[]
  /** Rescue when the response status is at or above this code, e.g. `400`. */
  status?: number
}

export interface SamplingConfig {
  /**
   * Head sampling: the share of records kept per level, decided as each record
   * is emitted. Without this, sampling is off — `tail` alone rescues nothing,
   * because only head-dropped records are buffered.
   */
  head?: HeadSamplingConfig
  /**
   * Cap on records buffered per request while awaiting a tail verdict.
   * Records past the cap are dropped.
   * @default 100
   */
  maxBufferedPerRequest?: number
  /**
   * Tail sampling: replays a request's head-dropped records when the finished
   * request matches, so failures and slow paths keep their full log trail.
   */
  tail?: TailSamplingConfig
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

/** Context passed to {@link Options.config.onError} when a sink fails. */
export interface SinkErrorContext {
  error: unknown
  sink: 'enricher' | 'file' | 'rotation' | 'transport'
}

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

export interface FormattingConfig {
  /** How many object nesting levels to expand in the context tree; default 1. */
  contextDepth?: number
  customLogFormat?: string
  ip?: boolean
  /** Include query parameters in the logged URL path; default false. */
  logQueryParams?: boolean
  /** Service name shown in `{service}` token (e.g. evlog-style `[my-app]`). */
  service?: string
  /** Render `data.context` as tree lines under the main log line; default true. */
  showContextTree?: boolean
  showStartupMessage?: boolean
  /** Duration (ms) below this uses green; default 500. */
  slowThreshold?: number
  startupMessageFormat?: 'simple' | 'banner'
  timestamp?: {
    translateTime?: string
  }
  useColors?: boolean
  /** Duration (ms) at or above this uses red + `{speed}` badge; default 1000. */
  verySlowThreshold?: number
}

export interface OutputConfig {
  disableFileLogging?: boolean
  disableInternalLogger?: boolean
  /** Directory mode for created log directories. @default 0o700 */
  logDirMode?: number
  /** File mode for created log files. @default 0o600 */
  logFileMode?: number
  logFilePath?: string
  logRotation?: LogRotationConfig
  /**
   * Called when a sink (transport, file, rotation) or an enricher fails.
   * Errors thrown by the hook itself are swallowed. When absent, failures go
   * to stderr (rate-limited for transports and enrichers).
   */
  onError?: (context: SinkErrorContext) => void
  transports?: Transport[]
  useTransportsOnly?: boolean
}

export interface RedactionConfig {
  /**
   * Automatically redact sensitive information (PII) from logs.
   * Masks emails, IP addresses, Luhn-valid payment card numbers, and JWTs in strings and deeply nested objects.
   */
  autoRedact?: boolean

  /**
   * Log the offending payload (`found`/`errors`) from validation errors.
   * Off by default: request bodies routinely contain credentials.
   * @default false
   */
  logErrorPayload?: boolean

  /**
   * Additional key/header names (case-insensitive; `-`/`_`/camelCase variants
   * are normalized) whose values are redacted when `autoRedact` is enabled.
   * Extends the built-in list (authorization, cookie, x-api-key, password,
   * secret, token, session, …).
   */
  redactKeys?: string[]
}

export interface RequestTrackingConfig {
  /** Skip automatic WebSocket lifecycle logs from `wrapWs`; default false. */
  disableWebSocketLogging?: boolean

  /**
   * Context contributors run on every request. Whatever they return is merged
   * into the request context, so the fields reach the console tree, file logs,
   * and every transport at once.
   *
   * Each entry is either an {@link Enricher} (a `request` phase, a `response`
   * phase, or both) or a bare function, which is treated as the request phase.
   * Ready-made ones — traceparent, user agent, geo, sizes — live in
   * `logixlysia/enrichers`.
   */
  enrichers?: EnricherLike[]

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

  /**
   * Enable request-scoped logger propagation via AsyncLocalStorage.
   * When enabled, a request-scoped logger `log` is also derived on the Elysia context.
   * @default false
   */
  useAsyncLocalStorage?: boolean
}

export interface PinoConfig {
  pino?: (PinoLoggerOptions & { prettyPrint?: PrettyPrintConfig }) | undefined
}

export interface LogixlysiaConfig
  extends FormattingConfig,
    OutputConfig,
    RedactionConfig,
    RequestTrackingConfig,
    PinoConfig {
  logFilter?: LogFilter
  /**
   * Head + tail sampling. Head sampling thins high-volume levels by
   * percentage; tail sampling replays what head dropped once the request turns
   * out to be interesting (an error, a slow path, a watched route).
   */
  sampling?: SamplingConfig
}

export interface Options {
  config?: LogixlysiaConfig
  /**
   * Opinionated defaults for common environments.
   * Explicit `config` fields override preset values.
   */
  preset?: LogPreset
}
