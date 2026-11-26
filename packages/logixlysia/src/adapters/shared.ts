import { LOG_LEVELS, levelRank } from '../helpers/level'
import type { LogLevel, Transport } from '../interfaces'
import { stringifyForLog } from '../utils/json'
import { sanitizeLogText } from '../utils/sanitize'
import { settle } from '../utils/settle'

export const OTEL_SEVERITY: Record<LogLevel, number> = {
  DEBUG: 5,
  ERROR: 17,
  INFO: 9,
  WARNING: 13
}

const DEFAULT_FLUSH_INTERVAL_MS = 2000
export const DEFAULT_MAX_BATCH_SIZE = 20
const DEFAULT_MAX_ENTRIES_PER_REQUEST = 500
const DEFAULT_MAX_PENDING_BATCHES = 32
const DEFAULT_RETRIES = 2
const REPORT_INTERVAL_MS = 5000
const DEFAULT_TIMEOUT_MS = 5000
const RETRY_BASE_DELAY_MS = 250
const RETRY_JITTER_MIN = 0.5
const MAX_RETRY_AFTER_MS = 30_000
/** `setTimeout` runs a timer above 2^31 - 1 ms after 1 ms. */
const MAX_TIMER_DELAY_MS = 2_147_483_647
const MILLIS_PER_SECOND = 1000
const HTTP_REQUEST_TIMEOUT = 408
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR_MIN = 500
const ERROR_BODY_PREVIEW_LENGTH = 200
const ERROR_BODY_MAX_READ = 1024
const SUCCESS_BODY_MAX_READ = 1_048_576
const FLATTEN_MAX_DEPTH = 3

export interface BatchTransportOptions {
  /**
   * How long (ms) an entry waits in the buffer before it is sent. While a
   * request is still in flight, it goes out as soon as that request returns.
   * @default 2000
   */
  flushIntervalMs?: number
  /**
   * Entries buffered before a send starts without waiting for the interval.
   * While a request is in flight, the batch goes out as soon as it returns.
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
   * entries wait, and entries beyond that are dropped and reported. A new
   * entry that outranks the quietest waiting entry takes the place of the
   * oldest entry at that level instead.
   * @default 32
   */
  maxPendingBatches?: number
  /**
   * The lowest level this transport receives; quieter records skip it and are
   * not counted as dropped. Leave it out to receive every level.
   */
  minLevel?: LogLevel
  /**
   * Called with how many entries were lost and why: `queue-full` when too many
   * were already waiting, `send-failed` when a request failed after retries,
   * `rejected` when the backend answered with success and said it did not
   * store part of the batch, `closed` when the transport closed: for a
   * `log()` after `close()`, and for the entries a close still held at its
   * deadline. Add up `count` for a running total.
   */
  onDropped?: (info: {
    count: number
    reason: 'closed' | 'queue-full' | 'rejected' | 'send-failed'
  }) => void
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
   * Retry attempts on network errors and on 408, 429 and 5xx responses.
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
  // The signature without an argument keeps `promise.then(transport.flush)`
  // type-checking for a promise of any type.
  /**
   * Stops accepting entries, then flushes the ones already accepted.
   * Idempotent. If `signal` aborts first, the request in flight is aborted,
   * a retry sleep ends, and every entry still held is given up: one
   * `onDropped({ count, reason: 'closed' })` covers them all, and the
   * promise rejects with how many there were.
   */
  close: (() => Promise<void>) &
    ((options?: { signal?: AbortSignal }) => Promise<void>)
  /**
   * Sends any buffered entries immediately. Call before process exit. If
   * `signal` aborts first, it resolves without waiting further: the request
   * in flight is left to finish, and what is still buffered goes out on the
   * interval timer. Read `signal.aborted` to tell the two apart.
   */
  flush: (() => Promise<void>) &
    ((options?: { signal?: AbortSignal }) => Promise<void>)
}

/** One record, as the transport received it. */
export interface LogEntry {
  level: LogLevel
  /** Empty for an access line; `entryText` names it from `meta`. */
  message: string
  /** A plain JSON copy of what was logged, taken when `log` was called. */
  meta: Record<string, unknown>
  /** When the transport received the record. */
  timestamp: Date
}

const UNSERIALIZABLE_TEXT = '[Unserializable]'

const snapshotValue = (value: unknown): unknown => {
  const json = stringifyForLog(value)
  if (json === '') {
    return
  }
  return JSON.parse(json) as unknown
}

export const snapshotMeta = (
  meta: Record<string, unknown>
): Record<string, unknown> => {
  const entries: [string, unknown][] = []
  for (const [key, value] of Object.entries(meta)) {
    const copy = snapshotValue(value)
    if (copy !== undefined) {
      entries.push([key, copy])
    }
  }
  // fromEntries defines own properties, so an own `__proto__` key in the
  // logged data stays a key instead of reaching the setter.
  return Object.fromEntries(entries)
}

export const stripTrailingSlashes = (url: string): string => {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') {
    end -= 1
  }
  return url.slice(0, end)
}

export const envString = (name: string): string | undefined => {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

export const transportError = (
  adapter: string,
  detail: string,
  options?: ErrorOptions
): Error => new Error(`[logixlysia] ${adapter} transport: ${detail}`, options)

const URL_USERINFO = /^(?<scheme>[a-z][a-z0-9+.-]*:\/\/).*@/iu
// Some intake APIs take their key in the query string.
const URL_QUERY_OR_FRAGMENT = /(?<mark>[?#]).*$/su

const withoutCredentials = (url: string): string =>
  url
    .replace(URL_USERINFO, '$<scheme><redacted>@')
    .replace(URL_QUERY_OR_FRAGMENT, '$<mark><redacted>')

export const tryParseUrl = (value: string): URL | undefined =>
  URL.canParse(value) ? new URL(value) : undefined

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

const sleepWithoutHolding = (ms: number): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  setTimeout(resolve, ms).unref?.()
  return promise
}

/** Entries a backend said it did not store, in a response that otherwise succeeded. */
export interface RejectedEntries {
  count: number
  /** The backend's own explanation, when it gave one. */
  detail?: string
}

export interface PostWithRetryInput {
  body: string
  headers: Record<string, string>
  name: string
  /** Reads a successful response; see `HttpTransportInput.rejected`. */
  rejected?: (response: unknown) => RejectedEntries | undefined
  retries: number
  /** Aborts the request in flight and ends the retries; an abort is not retried. */
  signal?: AbortSignal
  /**
   * Waits out the delay before a retry. Without it the wait does not hold
   * the process open.
   */
  sleep?: (ms: number) => Promise<void>
  timeout: number
  url: string
}

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

const readPreviewChunks = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  text: string,
  bytesRead: number
): Promise<string> => {
  if (bytesRead >= ERROR_BODY_MAX_READ) {
    return text
  }
  const { done, value } = await reader.read()
  if (done) {
    return text
  }
  return readPreviewChunks(
    reader,
    decoder,
    text + decoder.decode(value, { stream: true }),
    bytesRead + value.byteLength
  )
}

const readErrorPreview = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader()
  if (!reader) {
    return ''
  }
  let text = ''
  try {
    text = await readPreviewChunks(reader, new TextDecoder(), '', 0)
  } catch {
    text = ''
  } finally {
    await settle(reader.cancel())
  }
  return text
}

const readWholeChunks = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  text: string,
  bytesRead: number
): Promise<string | undefined> => {
  const { done, value } = await reader.read()
  if (done) {
    return text
  }
  const total = bytesRead + value.byteLength
  if (total > SUCCESS_BODY_MAX_READ) {
    return
  }
  return readWholeChunks(
    reader,
    decoder,
    text + decoder.decode(value, { stream: true }),
    total
  )
}

/** The whole body, or `undefined` when it is longer than the limit or unreadable. */
const readWholeBody = async (
  response: Response
): Promise<string | undefined> => {
  const reader = response.body?.getReader()
  if (!reader) {
    return ''
  }
  try {
    return await readWholeChunks(reader, new TextDecoder(), '', 0)
  } catch {
    return undefined
  } finally {
    await settle(reader.cancel())
  }
}

const readRejected = async (
  response: Response,
  hook: NonNullable<PostWithRetryInput['rejected']>
): Promise<RejectedEntries | undefined> => {
  const text = await readWholeBody(response)
  if (text === undefined) {
    return
  }
  let result: RejectedEntries | undefined
  try {
    result = hook(JSON.parse(text))
  } catch {
    return
  }
  const count = result?.count
  if (
    !(
      result &&
      typeof count === 'number' &&
      Number.isInteger(count) &&
      count > 0
    )
  ) {
    return
  }
  return typeof result.detail === 'string'
    ? {
        count,
        detail: sanitizeLogText(
          result.detail.slice(0, ERROR_BODY_PREVIEW_LENGTH)
        )
      }
    : { count }
}

const attemptPost = async (
  input: PostWithRetryInput,
  attempt: number
): Promise<RejectedEntries | undefined> => {
  const retryOrRethrow = async (
    error: Error,
    delayMs: number
  ): Promise<RejectedEntries | undefined> => {
    if (attempt >= input.retries || input.signal?.aborted) {
      throw error
    }
    await (input.sleep ?? sleepWithoutHolding)(delayMs)
    return attemptPost(input, attempt + 1)
  }

  input.signal?.throwIfAborted()
  const timeout = AbortSignal.timeout(input.timeout)
  let response: Response
  try {
    response = await fetch(input.url, {
      body: input.body,
      headers: input.headers,
      method: 'POST',
      redirect: 'error',
      signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout
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
    if (input.rejected) {
      return readRejected(response, input.rejected)
    }
    if (response.body) {
      await settle(response.body.cancel())
    }
    return
  }
  const body = await readErrorPreview(response)
  const detail = sanitizeLogText(body.slice(0, ERROR_BODY_PREVIEW_LENGTH))
  const httpError = new Error(
    `[logixlysia] ${input.name} transport: HTTP ${response.status}${
      detail ? ` — ${detail}` : ''
    }`
  )
  const retryable =
    response.status === HTTP_REQUEST_TIMEOUT ||
    response.status === HTTP_TOO_MANY_REQUESTS ||
    response.status >= HTTP_SERVER_ERROR_MIN
  if (!retryable) {
    throw httpError
  }
  return retryOrRethrow(httpError, resolveRetryDelay(response, attempt))
}

export const postWithRetry = (
  input: PostWithRetryInput
): Promise<RejectedEntries | undefined> => attemptPost(input, 0)

export interface BatchQueue {
  close: (options?: { signal?: AbortSignal }) => Promise<void>
  flush: (options?: { signal?: AbortSignal }) => Promise<void>
  push: (entry: LogEntry) => Promise<void> | undefined
}

/** Entries taken from the buffer for one request, kept until they end. */
interface Batch {
  ended: boolean
  entries: LogEntry[]
}

type BatchEnd =
  | { outcome: 'closed' }
  | { outcome: 'delivered'; rejected?: RejectedEntries }
  | { outcome: 'failed' }

/**
 * Waits for `work` until `signal` aborts, and tells whether `work` settled
 * first. A rejection of `work` before the abort passes through.
 */
const settlesBefore = async (
  work: Promise<void>,
  signal: AbortSignal | undefined
): Promise<boolean> => {
  if (!signal) {
    await work
    return true
  }
  if (signal.aborted) {
    return false
  }
  const { promise: aborted, resolve }: PromiseWithResolvers<boolean> =
    Promise.withResolvers()
  const stop = (): void => resolve(false)
  signal.addEventListener('abort', stop, { once: true })
  try {
    return await Promise.race([work.then(() => true), aborted])
  } finally {
    signal.removeEventListener('abort', stop)
  }
}

const createQueueReporter = (
  name: string,
  onError?: (error: unknown) => void
): ((error: unknown) => boolean) => {
  let lastReportedAt = 0

  return error => {
    if (onError) {
      try {
        onError(error)
      } catch {
        // Swallow errors thrown by the hook itself.
      }
      return true
    }

    const now = Date.now()
    if (now - lastReportedAt < REPORT_INTERVAL_MS) {
      return false
    }
    lastReportedAt = now
    console.error(`[logixlysia] ${name} transport failed:`, error)
    return true
  }
}

const notifyDropped = (
  onDropped: BatchTransportOptions['onDropped'],
  count: number,
  reason: 'closed' | 'queue-full' | 'rejected' | 'send-failed'
): void => {
  try {
    onDropped?.({ count, reason })
  } catch {
    // A hook that throws must not take the log pipeline with it.
  }
}

export const createBatchQueue = (input: {
  flushIntervalMs: number
  maxBatchSize: number
  maxEntriesPerRequest?: number
  maxPendingBatches?: number
  name: string
  onDropped?: BatchTransportOptions['onDropped']
  onError?: (error: unknown) => void
  send: (
    entries: LogEntry[],
    retry: { signal: AbortSignal; sleep: (ms: number) => Promise<void> }
  ) => Promise<RejectedEntries | ReturnType<() => void>>
}): BatchQueue => {
  let buffer: LogEntry[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | undefined
  /** The batch on the wire or sleeping before a retry. */
  let sending: Batch | undefined
  let dropped = 0
  let accepted = 0
  let settled = 0
  let callers = 0
  let closed = false
  const sleeping = new Set<ReturnType<typeof setTimeout>>()
  /** Aborted when a close gives up at its deadline. */
  const closing = new AbortController()

  const report = createQueueReporter(input.name, input.onError)
  const reportDrops = createQueueReporter(input.name, input.onError)
  const maxWaiting =
    (input.maxPendingBatches ?? DEFAULT_MAX_PENDING_BATCHES) *
    input.maxBatchSize
  const maxPerRequest = input.maxEntriesPerRequest ?? maxWaiting

  const takeBatch = (): Batch => {
    const entries = buffer.slice(0, maxPerRequest)
    buffer = buffer.slice(maxPerRequest)
    return { ended: false, entries }
  }

  const reportDropped = (): void => {
    if (dropped === 0) {
      return
    }
    const count = dropped
    dropped = 0
    const reported = reportDrops(
      new Error(
        `[logixlysia] ${input.name} transport: ${count} entries dropped while ${maxWaiting} were already waiting`
      )
    )
    if (!reported) {
      dropped += count
    }
  }

  const reportRejected = (sent: number, rejected: RejectedEntries): void => {
    const count = Math.min(rejected.count, sent)
    notifyDropped(input.onDropped, count, 'rejected')
    report(
      new Error(
        `[logixlysia] ${input.name} transport: backend rejected ${count} of ${sent} entries${
          rejected.detail ? ` — ${rejected.detail}` : ''
        }`
      )
    )
  }

  /**
   * Ends a batch: delivered, with what the backend said it rejected; failed
   * after its retries; or given up by a close. A batch ends once. A later
   * call for it does nothing and returns false, so a response that lands
   * after a close gave its batch up is not counted again.
   */
  const endBatch = (batch: Batch, end: BatchEnd): boolean => {
    if (batch.ended) {
      return false
    }
    batch.ended = true
    settled += batch.entries.length
    if (end.outcome === 'failed') {
      notifyDropped(input.onDropped, batch.entries.length, 'send-failed')
    } else if (end.outcome === 'delivered' && end.rejected) {
      reportRejected(batch.entries.length, end.rejected)
    }
    return true
  }

  const setCallers = (count: number): void => {
    const held = callers > 0
    callers = count
    if (held === callers > 0) {
      return
    }
    for (const sleeper of sleeping) {
      if (callers > 0) {
        sleeper.ref?.()
      } else {
        sleeper.unref?.()
      }
    }
  }

  /**
   * Runs `work` for a caller who awaits it. A retry sleep holds the process
   * open only while there is such a caller, whichever send it belongs to.
   */
  const awaited = async (work: () => Promise<void>): Promise<void> => {
    setCallers(callers + 1)
    try {
      await work()
    } finally {
      setCallers(callers - 1)
    }
  }

  const sleep = async (ms: number): Promise<void> => {
    const { promise, resolve }: PromiseWithResolvers<void> =
      Promise.withResolvers()
    const sleeper = setTimeout(resolve, ms)
    if (callers === 0) {
      sleeper.unref?.()
    }
    const wake = (): void => {
      clearTimeout(sleeper)
      resolve()
    }
    sleeping.add(sleeper)
    closing.signal.addEventListener('abort', wake, { once: true })
    try {
      await promise
    } finally {
      sleeping.delete(sleeper)
      closing.signal.removeEventListener('abort', wake)
    }
  }

  const runSend = async (batch: Batch, background: boolean): Promise<void> => {
    sending = batch
    try {
      await Promise.resolve()
      const rejected = await input.send(batch.entries, {
        signal: closing.signal,
        sleep
      })
      endBatch(batch, { outcome: 'delivered', rejected: rejected || undefined })
    } catch (error) {
      if (endBatch(batch, { outcome: 'failed' })) {
        if (!background) {
          throw error
        }
        report(error)
      }
    } finally {
      sending = undefined
      inFlight = undefined
      if (buffer.length >= input.maxBatchSize) {
        inFlight = runSend(takeBatch(), true)
      }
      reportDropped()
    }
  }

  const reportFailure = async (send: Promise<void>): Promise<void> => {
    try {
      await send
    } catch (error) {
      report(error)
    }
  }

  const startSend = (): Promise<void> => {
    const send = runSend(takeBatch(), false)
    inFlight = settle(send)
    return send
  }

  /** Sends until `target` entries have ended, or until `signal` aborts. */
  const drainUntil = async (
    target: number,
    signal: AbortSignal | undefined,
    failure?: unknown
  ): Promise<void> => {
    if (settled >= target) {
      if (failure !== undefined) {
        throw failure
      }
      return
    }
    let error = failure
    let finished: boolean
    if (inFlight) {
      finished = await settlesBefore(inFlight, signal)
    } else {
      const send = startSend()
      try {
        finished = await settlesBefore(send, signal)
      } catch (sendError) {
        error ??= sendError
        finished = true
      }
      if (!finished) {
        // Nobody awaits this send any more, so a failure is reported like
        // one the queue started on its own.
        reportFailure(send)
      }
    }
    if (finished && !signal?.aborted) {
      return drainUntil(target, signal, error)
    }
    if (error !== undefined) {
      throw error
    }
  }

  const drain = (signal?: AbortSignal): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    return drainUntil(accepted, signal)
  }

  const flushFromTimer = async (): Promise<void> => {
    try {
      await drain()
    } catch (error) {
      report(error)
    }
  }

  const armTimer = (): void => {
    timer = setTimeout(flushFromTimer, input.flushIntervalMs)
    timer.unref?.()
  }

  const flush = (options?: { signal?: AbortSignal }): Promise<void> =>
    awaited(async () => {
      try {
        await drain(options?.signal)
      } finally {
        // A flush that stopped at its deadline cleared the interval timer;
        // what it left buffered goes out on the timer, as in normal running.
        if (buffer.length > 0 && !timer) {
          armTimer()
        }
      }
    })

  /**
   * Gives up everything the queue still holds, for a close at its deadline:
   * the buffer, and the batch on the wire or sleeping before a retry, whose
   * request and sleep end now. Reports them once and returns how many.
   */
  const abandon = (): number => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    let count = buffer.length
    settled += buffer.length
    buffer = []
    if (sending && endBatch(sending, { outcome: 'closed' })) {
      count += sending.entries.length
    }
    closing.abort()
    if (count > 0) {
      notifyDropped(input.onDropped, count, 'closed')
    }
    return count
  }

  const close = async (options?: { signal?: AbortSignal }): Promise<void> => {
    closed = true
    const signal = options?.signal
    let lost = 0
    // Gives up in the turn the deadline passes, before a response that
    // lands in that turn can end the batch.
    const giveUp = (): void => {
      lost = abandon()
    }
    if (signal?.aborted) {
      giveUp()
    } else {
      signal?.addEventListener('abort', giveUp, { once: true })
      try {
        await awaited(() => drain(signal))
      } catch (error) {
        if (lost === 0) {
          throw error
        }
      } finally {
        signal?.removeEventListener('abort', giveUp)
      }
    }
    if (lost > 0) {
      throw transportError(
        input.name,
        `close gave up on ${lost} entries at its deadline`
      )
    }
  }

  /** Drops the oldest entry at the quietest waiting level when `level` outranks it. */
  const evictQuieter = (level: LogLevel): boolean => {
    let quietest = Number.POSITIVE_INFINITY
    let index = -1
    for (const [position, waiting] of buffer.entries()) {
      const rank = levelRank(waiting.level)
      if (rank < quietest) {
        quietest = rank
        index = position
      }
    }
    if (index === -1 || levelRank(level) <= quietest) {
      return false
    }
    buffer.splice(index, 1)
    return true
  }

  const push = (entry: LogEntry): Promise<void> | undefined => {
    if (closed) {
      notifyDropped(input.onDropped, 1, 'closed')
      return
    }
    if (inFlight && buffer.length >= maxWaiting) {
      dropped += 1
      notifyDropped(input.onDropped, 1, 'queue-full')
      if (!evictQuieter(entry.level)) {
        return
      }
      // The evicted entry leaves the queue unsent, so a pending flush target must not be satisfied by it.
      accepted -= 1
    }
    buffer.push(entry)
    accepted += 1
    if (!timer) {
      armTimer()
    }
    if (buffer.length >= input.maxBatchSize) {
      return inFlight ? undefined : drain()
    }
  }

  return { close, flush, push }
}

export interface HttpTransportInput {
  /**
   * Turns one batch into the request body. It runs once per request, and a
   * throw fails that request and reports its entries as `send-failed`.
   */
  body: (entries: LogEntry[]) => string
  /** Sent with every request, for example `Content-Type` and credentials. */
  headers: Record<string, string>
  /** Labels this transport in error messages. */
  name: string
  /**
   * Batching, retry, timeout, queue and `minLevel` settings. Pass the options
   * your caller gave you straight through.
   */
  options: BatchTransportOptions
  /**
   * Reads a successful response for entries the backend did not store. It
   * receives the parsed JSON body; a body that is not JSON is taken as
   * nothing rejected. Rejected entries are not retried: they are reported
   * to `onDropped` with reason `rejected`, and to `onError`.
   */
  rejected?: (response: unknown) => RejectedEntries | undefined
  /** Where each batch is POSTed. Must be an `http:` or `https:` URL. */
  url: string
}

/**
 * Builds a transport that POSTs batches of log entries to `url`, with the same
 * batching, retry with backoff, bounded queue, `onDropped`, `flush` and
 * `close` that the built-in adapters have. Invalid options or an invalid URL
 * throw when the transport is created.
 */
export const createHttpTransport = (
  input: HttpTransportInput
): AdapterTransport => {
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

  const nonNegativeInteger = (name: string, value: number): number => {
    if (!Number.isInteger(value) || value < 0) {
      throw transportError(
        input.name,
        `${name} must be an integer at or above 0, got ${value}`
      )
    }
    return value
  }

  const millisecondsInRange = (
    name: string,
    value: number,
    min: number,
    max: number,
    { integer }: { integer: boolean }
  ): number => {
    const inRange = !Number.isNaN(value) && value >= min && value <= max
    if (!inRange || (integer && !Number.isInteger(value))) {
      throw transportError(
        input.name,
        `${name} must be a ${integer ? 'whole number' : 'number'} of milliseconds from ${min} to ${max}, got ${value}`
      )
    }
    return value
  }

  const { minLevel } = input.options
  if (minLevel !== undefined && !LOG_LEVELS.includes(minLevel)) {
    throw transportError(
      input.name,
      `minLevel must be one of ${LOG_LEVELS.join(', ')}, got ${String(minLevel)}`
    )
  }

  const maxBatchSize = positiveInteger(
    'maxBatchSize',
    input.options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE
  )
  const maxEntriesPerRequest = positiveInteger(
    'maxEntriesPerRequest',
    input.options.maxEntriesPerRequest ?? DEFAULT_MAX_ENTRIES_PER_REQUEST
  )

  const retries = nonNegativeInteger(
    'retries',
    input.options.retries ?? DEFAULT_RETRIES
  )
  // AbortSignal.timeout rejects fractions, and 0 would abort every request.
  const timeout = millisecondsInRange(
    'timeout',
    input.options.timeout ?? DEFAULT_TIMEOUT_MS,
    1,
    MAX_TIMER_DELAY_MS,
    { integer: true }
  )
  const flushIntervalMs = millisecondsInRange(
    'flushIntervalMs',
    input.options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    0,
    MAX_TIMER_DELAY_MS,
    { integer: false }
  )
  const maxPendingBatches = positiveInteger(
    'maxPendingBatches',
    input.options.maxPendingBatches ?? DEFAULT_MAX_PENDING_BATCHES
  )

  const queue = createBatchQueue({
    flushIntervalMs,
    maxBatchSize,
    maxEntriesPerRequest,
    maxPendingBatches,
    name: input.name,
    onDropped: input.options.onDropped,
    onError: input.options.onError,
    send: (entries, { signal, sleep }) =>
      postWithRetry({
        body: input.body(entries),
        headers: input.headers,
        name: input.name,
        rejected: input.rejected,
        retries,
        signal,
        sleep,
        timeout,
        url
      })
  })

  return {
    close: queue.close,
    flush: queue.flush,
    log: (level, message, meta) =>
      queue.push({
        level,
        message,
        meta: snapshotMeta(meta ?? {}),
        timestamp: new Date()
      }),
    minLevel
  }
}

export type FlatValue = boolean | number | string

export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date)

// A plain assignment to `__proto__` would hit the prototype setter and drop the field.
const setFlat = (
  out: Record<string, FlatValue>,
  key: string,
  value: FlatValue
): void => {
  Object.defineProperty(out, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

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
    setFlat(out, prefix, value)
    return
  }
  if (value instanceof Date) {
    setFlat(
      out,
      prefix,
      Number.isNaN(value.getTime()) ? UNSERIALIZABLE_TEXT : value.toISOString()
    )
    return
  }
  if (typeof value === 'bigint') {
    setFlat(out, prefix, value.toString())
    return
  }
  if (isPlainObject(value) && depth < FLATTEN_MAX_DEPTH) {
    let entries: [string, unknown][]
    try {
      entries = Object.entries(value)
    } catch {
      setFlat(out, prefix, UNSERIALIZABLE_TEXT)
      return
    }
    for (const [key, child] of entries) {
      flattenInto(out, child, prefix ? `${prefix}.${key}` : key, depth + 1)
    }
    return
  }
  const json = stringifyForLog(value)
  if (json !== '') {
    setFlat(out, prefix, json)
  }
}

export const flattenMeta = (
  meta: Record<string, unknown>
): Record<string, FlatValue> => {
  const out: Record<string, FlatValue> = {}
  flattenInto(out, meta, '', 0)
  return out
}

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
 * A one-line text for an entry: its message, or `METHOD /path` for an access
 * line, which has no message. Falls back to the level when neither exists.
 */
export const defaultBody = (entry: LogEntry): string => {
  if (entry.message) {
    return entry.message
  }
  const { request } = entry.meta
  if (isPlainObject(request)) {
    const method = typeof request.method === 'string' ? request.method : ''
    const url = typeof request.url === 'string' ? request.url : ''
    const path = tryParseUrl(url)?.pathname ?? url
    const body = `${method} ${path}`.trim()
    if (body) {
      return body
    }
  }
  return entry.level
}
