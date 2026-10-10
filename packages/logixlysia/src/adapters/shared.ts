import type { LogLevel, Transport } from '../interfaces'
import { sanitizeLogText } from '../utils/sanitize'
import { settle } from '../utils/settle'

/** OpenTelemetry severity numbers for each Logixlysia log level. */
export const OTEL_SEVERITY: Record<LogLevel, number> = {
  DEBUG: 5,
  ERROR: 17,
  INFO: 9,
  WARNING: 13
}

const DEFAULT_FLUSH_INTERVAL_MS = 2000
const DEFAULT_MAX_BATCH_SIZE = 20
const DEFAULT_MAX_ENTRIES_PER_REQUEST = 500
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
   * The most entries one request carries. Lower it for a backend with a
   * per-request item limit. The Sentry adapter defaults to 100.
   * @default 500
   */
  maxEntriesPerRequest?: number
  /**
   * Bound on the entries that wait behind the request in flight, as a
   * multiple of `maxBatchSize`: at most `maxPendingBatches × maxBatchSize`
   * entries wait, and entries beyond that are dropped and reported.
   * @default 32
   */
  maxPendingBatches?: number
  /**
   * Called when a request fails after retries, or when entries are dropped
   * because too many were already waiting. Failures of a request that a
   * `log()` or `flush()` call started are rejected to that caller instead.
   * When omitted, failures go to stderr, rate limited to once every 5
   * seconds. To see every transport failure in one place, forward them to
   * the function you give `config.onError`, as
   * `error => handle({ error, sink: 'transport' })`.
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
  /** Stops accepting entries, then flushes the ones already accepted. Idempotent. */
  close: () => Promise<void>
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
export const transportError = (
  adapter: string,
  detail: string,
  options?: ErrorOptions
): Error => new Error(`[logixlysia] ${adapter} transport: ${detail}`, options)

/** `scheme://user:pass@host` with everything between `://` and the last `@` replaced. */
const URL_USERINFO = /^(?<scheme>[a-z][a-z0-9+.-]*:\/\/).*@/iu

const withoutCredentials = (url: string): string =>
  url.replace(URL_USERINFO, '$<scheme><redacted>@')

const tryParseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value)
  } catch {
    // Reported by the caller, without the input: it may carry credentials.
  }
}

/** Parses a fully built endpoint once, at construction, so a bad env var fails here rather than on the first flush. */
export const resolveEndpoint = (name: string, url: string): string => {
  const parsed = tryParseUrl(url)
  if (!parsed) {
    throw transportError(
      name,
      `invalid endpoint URL '${withoutCredentials(url)}'`
    )
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw transportError(
      name,
      `endpoint must use http or https, got '${parsed.protocol}'`
    )
  }
  return parsed.toString()
}

const NANOS_PER_MILLI = 1_000_000n

/** Unix-epoch nanoseconds as a string, the timestamp shape OTLP and Loki expect. */
export const toUnixNanos = (date: Date): string =>
  String(BigInt(date.getTime()) * NANOS_PER_MILLI)

const sleep = (ms: number): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  setTimeout(resolve, ms)
  return promise
}

export interface PostWithRetryInput {
  body: string
  headers: Record<string, string>
  /** Adapter name used in error messages, e.g. 'Axiom'. */
  name: string
  retries: number
  timeout: number
  url: string
}

/**
 * RFC 9110 `delta-seconds`: digits and nothing else. Reading the value the
 * way `parseInt` does would take `"1e3"` as 1 s and `"+5"` as 5 s, values the
 * spec does not allow; those fall through to the date branch instead.
 */
const DELTA_SECONDS_REGEX = /^\d+$/u

const parseRetryAfterMs = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (DELTA_SECONDS_REGEX.test(trimmed)) {
    return Number(trimmed) * MILLIS_PER_SECOND
  }
  // `Date.parse` is lenient enough to read `"+5"` and `"5.5"` as dates in
  // 2001, so a date already in the past is no hint at all rather than a delay
  // of zero, which would retry with no backoff.
  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) {
    return
  }
  const delta = at - Date.now()
  return delta > 0 ? delta : undefined
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
      redirect: 'error',
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
  let body = ''
  try {
    body = await response.text()
  } catch {
    // An unreadable body only costs the error message its detail.
  }
  const detail = sanitizeLogText(body.slice(0, ERROR_BODY_PREVIEW_LENGTH))
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
 * One request runs at a time, so entries reach the backend in the order they
 * were buffered. Entries that arrive while a request is in flight wait, and go
 * out together in the next request, up to `maxEntriesPerRequest`. That request
 * starts as soon as the one in flight returns if a full batch is waiting, and
 * on the timer otherwise. At most `maxPendingBatches × maxBatchSize` entries
 * wait; beyond that, entries are dropped and reported once per request.
 * `flush()` resolves once every entry accepted before the call has settled.
 */
export const createBatchQueue = (input: {
  flushIntervalMs: number
  maxBatchSize: number
  /** The most entries one request carries. */
  maxEntriesPerRequest?: number
  maxPendingBatches?: number
  name: string
  onError?: (error: unknown) => void
  send: (entries: LogEntry[]) => Promise<void>
}): BatchQueue => {
  let buffer: LogEntry[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  /** The request in flight, as a promise that never rejects. */
  let inFlight: Promise<void> | undefined
  let dropped = 0
  // Entries accepted by `push` and entries whose request has settled. A
  // flush waits for the entries accepted before it was called, not for the
  // queue to go idle: under steady traffic it never is.
  let accepted = 0
  let settled = 0

  const report = createQueueReporter(input.name, input.onError)
  const maxWaiting =
    (input.maxPendingBatches ?? DEFAULT_MAX_PENDING_BATCHES) *
    input.maxBatchSize
  const maxPerRequest = input.maxEntriesPerRequest ?? maxWaiting

  const takeBatch = (): LogEntry[] => {
    const entries = buffer.slice(0, maxPerRequest)
    buffer = buffer.slice(maxPerRequest)
    return entries
  }

  const reportDropped = (): void => {
    if (dropped === 0) {
      return
    }
    // Reset first: an `onError` that logs through this transport can drop
    // more entries while it runs, and the next report must count them.
    const count = dropped
    dropped = 0
    report(
      new Error(
        `[logixlysia] ${input.name} transport: ${count} entries dropped while ${maxWaiting} were already waiting`
      )
    )
  }

  /**
   * Runs the one request for `entries`, then starts the next request if a
   * full batch arrived meanwhile. A send started by `push` or `flush` rethrows
   * so that caller sees the failure; a send started here, with nobody
   * awaiting it, reports the failure instead.
   */
  const runSend = async (
    entries: LogEntry[],
    background: boolean
  ): Promise<void> => {
    try {
      // Yield first. Without it a `send` that throws synchronously runs this
      // `finally` inside `startSend`, before `inFlight` is assigned there, and
      // that assignment then overwrites the tracker of the request started
      // below. Do not remove.
      await Promise.resolve()
      await input.send(entries)
    } catch (error) {
      if (!background) {
        throw error
      }
      report(error)
    } finally {
      settled += entries.length
      inFlight = undefined
      // A full batch goes out at once; fewer entries wait for the timer, as
      // they would with nothing in flight. Sending every remainder would cost
      // a request per round trip under light traffic, and would let an
      // `onError` that logs each failure keep a failing backend busy.
      if (buffer.length >= input.maxBatchSize) {
        inFlight = runSend(takeBatch(), true)
      }
      // After the next request has started: an `onError` that logs through
      // this same transport re-enters `push`, and must find it in flight.
      reportDropped()
    }
  }

  /** Starts a request for the caller; `inFlight` tracks it without rejecting. */
  const startSend = (): Promise<void> => {
    const send = runSend(takeBatch(), false)
    inFlight = settle(send)
    return send
  }

  // Recursion rather than a loop: `no-await-in-loop` is an error in the lint
  // preset. The first failure of a request this drain started is kept and
  // rethrown once everything accepted before the flush has settled.
  const drainUntil = async (
    target: number,
    failure?: unknown
  ): Promise<void> => {
    if (settled >= target) {
      if (failure !== undefined) {
        throw failure
      }
      return
    }
    if (inFlight) {
      await inFlight
      return drainUntil(target, failure)
    }
    try {
      await startSend()
    } catch (error) {
      return drainUntil(target, failure ?? error)
    }
    return drainUntil(target, failure)
  }

  const flush = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    return drainUntil(accepted)
  }

  const flushFromTimer = async (): Promise<void> => {
    try {
      await flush()
    } catch (error) {
      report(error)
    }
  }

  const push = (entry: LogEntry): Promise<void> | undefined => {
    if (inFlight && buffer.length >= maxWaiting) {
      dropped += 1
      return
    }
    buffer.push(entry)
    accepted += 1
    // Before the batch check: a full batch waiting behind a request in flight
    // can be split by the per-request cap, and what is left goes out on the
    // timer.
    if (!timer) {
      timer = setTimeout(flushFromTimer, input.flushIntervalMs)
      timer.unref?.()
    }
    if (buffer.length >= input.maxBatchSize) {
      return inFlight ? undefined : flush()
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
  const url = resolveEndpoint(input.name, input.url)

  const positiveInteger = (name: string, value: number): number => {
    if (!Number.isInteger(value) || value < 1) {
      throw transportError(
        input.name,
        `${name} must be a positive integer, got ${value}`
      )
    }
    return value
  }

  const maxBatchSize = positiveInteger(
    'maxBatchSize',
    input.options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE
  )
  const maxEntriesPerRequest = positiveInteger(
    'maxEntriesPerRequest',
    input.options.maxEntriesPerRequest ?? DEFAULT_MAX_ENTRIES_PER_REQUEST
  )

  const queue = createBatchQueue({
    flushIntervalMs: input.options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    maxBatchSize,
    maxEntriesPerRequest,
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
        url
      })
  })

  let closed = false

  return {
    close: async () => {
      closed = true
      await queue.flush()
    },
    flush: queue.flush,
    log: (level, message, meta) =>
      closed
        ? undefined
        : queue.push({
            level,
            message,
            meta: meta ?? {},
            timestamp: new Date()
          })
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
