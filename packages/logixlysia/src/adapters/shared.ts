import type { LogLevel, Transport } from '../interfaces'
import { sanitizeLogText } from '../utils/sanitize'

/** OpenTelemetry severity numbers for each Logixlysia log level. */
export const OTEL_SEVERITY: Record<LogLevel, number> = {
  DEBUG: 5,
  ERROR: 17,
  INFO: 9,
  WARNING: 13
}

const DEFAULT_FLUSH_INTERVAL_MS = 2000
const DEFAULT_MAX_BATCH_SIZE = 20
const DEFAULT_MAX_PENDING_BATCHES = 32
const DEFAULT_RETRIES = 2
const REPORT_INTERVAL_MS = 5000
const DEFAULT_TIMEOUT_MS = 5000
const RETRY_BASE_DELAY_MS = 250
const RETRY_JITTER_MIN = 0.5
const MAX_RETRY_AFTER_MS = 30_000
const MILLIS_PER_SECOND = 1000
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR_MIN = 500
const ERROR_BODY_PREVIEW_LENGTH = 200
const FLATTEN_MAX_DEPTH = 3

export interface BatchTransportOptions {
  /**
   * Max time (ms) an entry waits in the buffer before it is sent.
   * @default 2000
   */
  flushIntervalMs?: number
  /**
   * Entries buffered before an immediate flush, regardless of the interval.
   * @default 20
   */
  maxBatchSize?: number
  /**
   * Batches allowed to be waiting on the backend at once. Once the limit is
   * reached, new batches are dropped and reported instead of buffered, so an
   * unreachable backend cannot grow memory without bound.
   * @default 32
   */
  maxPendingBatches?: number
  /**
   * Called when a batch fails after retries, or is dropped because too
   * many batches are pending. When omitted, failures go to stderr, rate
   * limited to once every 5 seconds. Pass the same function you give
   * `config.onError` to see transport failures in one place.
   */
  onError?: (error: unknown) => void
  /**
   * Retry attempts on network errors, 429, and 5xx responses.
   * @default 2
   */
  retries?: number
  /**
   * Per-request timeout in milliseconds.
   * @default 5000
   */
  timeout?: number
}

/** A {@link Transport} that batches entries and can be flushed on demand. */
export interface AdapterTransport extends Transport {
  /** Sends any buffered entries immediately. Call before process exit. */
  flush: () => Promise<void>
}

export interface LogEntry {
  level: LogLevel
  message: string
  meta: Record<string, unknown>
  timestamp: Date
}

/** Normalizes a base URL by dropping trailing slashes. */
export const stripTrailingSlashes = (url: string): string => {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') {
    end -= 1
  }
  return url.slice(0, end)
}

/** Reads a non-empty environment variable, or `undefined`. */
export const envString = (name: string): string | undefined => {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

/** A configuration error for the named adapter, thrown at creation time. */
export const transportError = (adapter: string, detail: string): Error =>
  new Error(`[logixlysia] ${adapter} transport: ${detail}`)

const NANOS_PER_MILLI = 1_000_000n

/** Unix-epoch nanoseconds as a string, the timestamp shape OTLP and Loki expect. */
export const toUnixNanos = (date: Date): string =>
  String(BigInt(date.getTime()) * NANOS_PER_MILLI)

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

export interface PostWithRetryInput {
  body: string
  headers: Record<string, string>
  /** Adapter name used in error messages, e.g. 'Axiom'. */
  name: string
  retries: number
  timeout: number
  url: string
}

const parseRetryAfterMs = (value: string): number | undefined => {
  const seconds = Number.parseInt(value, 10)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * MILLIS_PER_SECOND
  }
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : at - Date.now()
}

/**
 * How long to wait before the next attempt: the server's `Retry-After`
 * (delta-seconds or HTTP-date, capped at 30 s) when it sent a usable one,
 * otherwise jittered linear backoff.
 */
export const resolveRetryDelay = (
  response: Response | undefined,
  attempt: number
): number => {
  const header = response?.headers.get('retry-after')
  const retryAfterMs = header ? parseRetryAfterMs(header) : undefined
  if (retryAfterMs !== undefined) {
    return Math.min(Math.max(retryAfterMs, 0), MAX_RETRY_AFTER_MS)
  }
  return (
    RETRY_BASE_DELAY_MS * (attempt + 1) * (RETRY_JITTER_MIN + Math.random())
  )
}

const attemptPost = async (
  input: PostWithRetryInput,
  attempt: number
): Promise<void> => {
  const retryOrRethrow = async (
    error: Error,
    delayMs: number
  ): Promise<void> => {
    if (attempt >= input.retries) {
      throw error
    }
    await sleep(delayMs)
    return attemptPost(input, attempt + 1)
  }

  let response: Response
  try {
    response = await fetch(input.url, {
      body: input.body,
      headers: input.headers,
      method: 'POST',
      signal: AbortSignal.timeout(input.timeout)
    })
  } catch (fetchError) {
    return retryOrRethrow(
      fetchError instanceof Error
        ? fetchError
        : new Error(`[logixlysia] ${input.name} transport: request failed`, {
            cause: fetchError
          }),
      resolveRetryDelay(undefined, attempt)
    )
  }
  if (response.ok) {
    try {
      await response.body?.cancel()
    } catch {
      // Nothing to release when the body is already consumed or closed.
    }
    return
  }
  const detail = sanitizeLogText(
    (await response.text().catch(() => '')).slice(0, ERROR_BODY_PREVIEW_LENGTH)
  )
  const httpError = new Error(
    `[logixlysia] ${input.name} transport: HTTP ${response.status}${
      detail ? ` — ${detail}` : ''
    }`
  )
  const retryable =
    response.status === HTTP_TOO_MANY_REQUESTS ||
    response.status >= HTTP_SERVER_ERROR_MIN
  if (!retryable) {
    throw httpError
  }
  return retryOrRethrow(httpError, resolveRetryDelay(response, attempt))
}

/**
 * POSTs a payload, retrying on network errors, 429, and 5xx responses with
 * jittered linear backoff, or the server's `Retry-After` when it sends one.
 * Non-retryable HTTP errors (4xx except 429) throw immediately.
 */
export const postWithRetry = (input: PostWithRetryInput): Promise<void> =>
  attemptPost(input, 0)

export interface BatchQueue {
  flush: () => Promise<void>
  push: (entry: LogEntry) => Promise<void> | undefined
}

/**
 * Routes a batch failure to the adapter's `onError` hook, or — when no hook is
 * configured — to stderr at most once per interval, so a backend that fails on
 * every batch cannot flood the console.
 */
const createQueueReporter = (
  name: string,
  onError?: (error: unknown) => void
): ((error: unknown) => void) => {
  let lastReportedAt = 0

  return error => {
    if (onError) {
      try {
        onError(error)
      } catch {
        // Swallow errors thrown by the hook itself.
      }
      return
    }

    const now = Date.now()
    if (now - lastReportedAt < REPORT_INTERVAL_MS) {
      return
    }
    lastReportedAt = now
    console.error(`[logixlysia] ${name} transport failed:`, error)
  }
}

/**
 * Buffers entries and sends them in batches: immediately once `maxBatchSize`
 * is reached (the returned promise propagates send errors to the caller), or
 * after `flushIntervalMs` via an unref'ed timer (errors go to `onError` since
 * no caller is awaiting).
 *
 * Only one send runs at a time, so batches reach the backend in the order they
 * were buffered, and `flush()` resolves once every batch queued before it has
 * settled. Batches queued beyond `maxPendingBatches` are dropped and reported.
 */
export const createBatchQueue = (input: {
  flushIntervalMs: number
  maxBatchSize: number
  maxPendingBatches?: number
  name: string
  onError?: (error: unknown) => void
  send: (entries: LogEntry[]) => Promise<void>
}): BatchQueue => {
  let buffer: LogEntry[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let tail: Promise<void> = Promise.resolve()
  let pending = 0

  const report = createQueueReporter(input.name, input.onError)
  const maxPendingBatches =
    input.maxPendingBatches ?? DEFAULT_MAX_PENDING_BATCHES

  const enqueueSend = (entries: LogEntry[]): Promise<void> => {
    if (pending >= maxPendingBatches) {
      report(
        new Error(
          `[logixlysia] ${input.name} transport: ${pending} batches pending; batch of ${entries.length} dropped`
        )
      )
      return tail
    }
    pending += 1
    const send = tail.then(() => input.send(entries))
    // Swallow the failure on the chain itself so one bad batch cannot poison
    // the batches after it; the caller of enqueueSend still sees the rejection.
    tail = send
      .catch(() => undefined)
      .then(() => {
        pending -= 1
      })
    return send
  }

  const flush = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (buffer.length === 0) {
      return tail
    }
    const entries = buffer
    buffer = []
    return enqueueSend(entries).then(() => tail)
  }

  const flushFromTimer = (): void => {
    flush().catch(report)
  }

  const push = (entry: LogEntry): Promise<void> | undefined => {
    buffer.push(entry)
    if (buffer.length >= input.maxBatchSize) {
      return flush()
    }
    if (!timer) {
      timer = setTimeout(flushFromTimer, input.flushIntervalMs)
      timer.unref?.()
    }
  }

  return { flush, push }
}

export interface HttpTransportInput {
  /** Builds the request body for a flushed batch. */
  body: (entries: LogEntry[]) => string
  headers: Record<string, string>
  /** Adapter name used in error messages, e.g. 'Axiom'. */
  name: string
  options: BatchTransportOptions
  url: string
}

/**
 * The common adapter shape: a batch queue whose flushes POST to a fixed URL
 * with retry, exposed as an {@link AdapterTransport}.
 */
export const createHttpTransport = (
  input: HttpTransportInput
): AdapterTransport => {
  const retries = input.options.retries ?? DEFAULT_RETRIES
  const timeout = input.options.timeout ?? DEFAULT_TIMEOUT_MS

  const queue = createBatchQueue({
    flushIntervalMs: input.options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    maxBatchSize: input.options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
    maxPendingBatches: input.options.maxPendingBatches,
    name: input.name,
    onError: input.options.onError,
    send: entries =>
      postWithRetry({
        body: input.body(entries),
        headers: input.headers,
        name: input.name,
        retries,
        timeout,
        url: input.url
      })
  })

  return {
    flush: queue.flush,
    log: (level, message, meta) =>
      queue.push({ level, message, meta: meta ?? {}, timestamp: new Date() })
  }
}

export type FlatValue = boolean | number | string

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date)

const flattenInto = (
  out: Record<string, FlatValue>,
  value: unknown,
  prefix: string,
  depth: number
): void => {
  if (value === null || value === undefined) {
    return
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    out[prefix] = value
    return
  }
  if (value instanceof Date) {
    out[prefix] = value.toISOString()
    return
  }
  if (isPlainObject(value) && depth < FLATTEN_MAX_DEPTH) {
    for (const [key, child] of Object.entries(value)) {
      flattenInto(out, child, prefix ? `${prefix}.${key}` : key, depth + 1)
    }
    return
  }
  try {
    out[prefix] = JSON.stringify(value)
  } catch {
    out[prefix] = String(value)
  }
}

/**
 * Flattens a transport meta object into dot-notation scalar keys
 * (`request.method`, `context.requestId`, …). Values nested deeper than three
 * levels — and arrays — are JSON-stringified.
 */
export const flattenMeta = (
  meta: Record<string, unknown>
): Record<string, FlatValue> => {
  const out: Record<string, FlatValue> = {}
  flattenInto(out, meta, '', 0)
  return out
}

/** Reads a dot-notation path (e.g. `context.userId`) from a meta object. */
export const getPath = (
  meta: Record<string, unknown>,
  path: string
): unknown => {
  let current: unknown = meta
  for (const segment of path.split('.')) {
    if (!isPlainObject(current)) {
      return
    }
    current = current[segment]
  }
  return current
}

/**
 * Fallback log body for access logs, whose `message` is empty:
 * `GET /path` derived from the request meta.
 */
export const defaultBody = (entry: LogEntry): string => {
  if (entry.message) {
    return entry.message
  }
  const { request } = entry.meta
  if (isPlainObject(request)) {
    const method = typeof request.method === 'string' ? request.method : ''
    const url = typeof request.url === 'string' ? request.url : ''
    let path = url
    try {
      path = new URL(url).pathname
    } catch {
      // Keep the raw URL when it does not parse.
    }
    const body = `${method} ${path}`.trim()
    if (body) {
      return body
    }
  }
  return entry.level
}
