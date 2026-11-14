import { snapshotMeta } from './adapters/shared'
import type { LogLevel, Transport } from './interfaces'

const DEFAULT_MAX_RECORDS = 1000
const DEFAULT_WAIT_TIMEOUT_MS = 1000
const MAX_TIMER_DELAY_MS = 2_147_483_647
/** Records named in a `waitFor` timeout message, newest last. */
const MAX_LISTED_RECORDS = 10
const PLACEHOLDER_ORIGIN = 'http://localhost'

/** The serialized error on a record; an `HttpError` keeps its `code`, `why`, `fix` and `link`. */
export interface MemoryRecordError {
  [key: string]: unknown
  cause?: unknown
  code?: string
  fix?: string
  /** Diagnostics from an `HttpError`'s `internal`. */
  internal?: unknown
  link?: string
  message: string
  name?: string
  stack?: string
  status?: number
  why?: string
}

/** One record a {@link MemoryTransport} captured, as plain data taken when it was logged. */
export interface MemoryRecord {
  /** The request context merged into the record, with redaction already applied. */
  context: Record<string, unknown>
  /** Milliseconds since the request started. */
  durationMs: number | undefined
  /** Present on a record logged for an error. */
  error: MemoryRecordError | undefined
  level: LogLevel
  /** Empty for an access line. */
  message: string
  /** Everything the transport received, for fields this record does not name. */
  meta: Record<string, unknown>
  /** The HTTP method of the request that produced the record. */
  method: string | undefined
  /** The request's pathname, without the query string. */
  path: string | undefined
  /** `context.requestId`, when the `requestId` option is on. */
  requestId: string | undefined
  /** Absent on a line a handler logs before the response exists. */
  status: number | undefined
  /** When the transport received the record. */
  timestamp: Date
}

export interface MemoryTransportOptions {
  /**
   * How many records are kept. Past it, the oldest record is dropped.
   * @default 1000
   */
  maxRecords?: number
}

export interface WaitForOptions {
  /**
   * How long to wait, in milliseconds, before rejecting.
   * @default 1000
   */
  timeoutMs?: number
}

/** A {@link Transport} that keeps what it receives, for assertions in a test. */
export interface MemoryTransport extends Transport {
  /** Forgets every record. A pending `waitFor` keeps waiting for a new one. */
  clear: () => void
  /** The first record `predicate` accepts, oldest first. */
  find: (
    predicate: (record: MemoryRecord) => boolean
  ) => MemoryRecord | undefined
  /** Every record `predicate` accepts, oldest first. */
  filter: (predicate: (record: MemoryRecord) => boolean) => MemoryRecord[]
  /** The newest record. */
  last: () => MemoryRecord | undefined
  /** A copy of the kept records, oldest first. */
  readonly records: readonly MemoryRecord[]
  /**
   * Resolves with the first record `predicate` accepts, one already kept or
   * one that arrives. Rejects after `timeoutMs` with the records it saw.
   */
  waitFor: (
    predicate: (record: MemoryRecord) => boolean,
    options?: WaitForOptions
  ) => Promise<MemoryRecord>
}

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const pathnameOf = (url: string): string => {
  try {
    return new URL(url, PLACEHOLDER_ORIGIN).pathname
  } catch {
    return url
  }
}

const toMemoryRecord = (
  level: LogLevel,
  message: string,
  rawMeta: Record<string, unknown> | undefined
): MemoryRecord => {
  const meta = snapshotMeta(rawMeta ?? {})
  const { context, durationMs, error, request, status } = meta
  const plainContext = isRecordObject(context) ? context : {}
  const requestInfo = isRecordObject(request) ? request : {}
  const { method, url } = requestInfo
  const { requestId } = plainContext

  return {
    context: plainContext,
    durationMs: typeof durationMs === 'number' ? durationMs : undefined,
    error: isRecordObject(error) ? (error as MemoryRecordError) : undefined,
    level,
    message,
    meta,
    method: typeof method === 'string' ? method : undefined,
    path: typeof url === 'string' ? pathnameOf(url) : undefined,
    requestId: typeof requestId === 'string' ? requestId : undefined,
    status: typeof status === 'number' ? status : undefined,
    timestamp: new Date()
  }
}

const describeRecord = (record: MemoryRecord): string => {
  const request =
    record.method === undefined && record.path === undefined
      ? ''
      : ` ${record.method ?? ''} ${record.path ?? ''}`.trimEnd()
  const status = record.status === undefined ? '' : ` ${record.status}`
  const text = record.message ? ` ${JSON.stringify(record.message)}` : ''
  return `${record.level}${request}${status}${text}`
}

const describeSeen = (records: readonly MemoryRecord[]): string => {
  if (records.length === 0) {
    return 'no records were logged'
  }
  const shown = records.slice(-MAX_LISTED_RECORDS)
  const omitted = records.length - shown.length
  const lines = shown.map(record => `  ${describeRecord(record)}`)
  const heading = `${records.length} record${records.length === 1 ? '' : 's'} seen${omitted > 0 ? ` (last ${shown.length} shown)` : ''}:`
  return [heading, ...lines].join('\n')
}

interface Waiter {
  predicate: (record: MemoryRecord) => boolean
  reject: (reason: unknown) => void
  resolve: (record: MemoryRecord) => void
  timer: ReturnType<typeof setTimeout>
}

const requirePositiveInteger = (name: string, value: number): number => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `[logixlysia] createMemoryTransport: ${name} must be a positive integer, got ${value}`
    )
  }
  return value
}

/**
 * Builds a transport that keeps the last `maxRecords` records in memory as
 * plain data, so a test can assert on what a route logged. Records are copied
 * when logged and carry the redaction that `autoRedact` applied.
 *
 * Pass it with `useTransportsOnly: true` to keep the console quiet.
 */
export const createMemoryTransport = (
  options: MemoryTransportOptions = {}
): MemoryTransport => {
  const maxRecords = requirePositiveInteger(
    'maxRecords',
    options.maxRecords ?? DEFAULT_MAX_RECORDS
  )
  let kept: MemoryRecord[] = []
  const waiters = new Set<Waiter>()

  const settleWaiter = (waiter: Waiter): void => {
    clearTimeout(waiter.timer)
    waiters.delete(waiter)
  }

  const offer = (record: MemoryRecord): void => {
    for (const waiter of waiters) {
      try {
        if (!waiter.predicate(record)) {
          continue
        }
        settleWaiter(waiter)
        waiter.resolve(record)
      } catch (error) {
        settleWaiter(waiter)
        waiter.reject(error)
      }
    }
  }

  const waitFor: MemoryTransport['waitFor'] = (predicate, waitOptions) => {
    const timeoutMs = waitOptions?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
    if (
      Number.isNaN(timeoutMs) ||
      timeoutMs < 0 ||
      timeoutMs > MAX_TIMER_DELAY_MS
    ) {
      return Promise.reject(
        new Error(
          `[logixlysia] memory transport: timeoutMs must be from 0 to ${MAX_TIMER_DELAY_MS}, got ${timeoutMs}`
        )
      )
    }
    const { promise, reject, resolve }: PromiseWithResolvers<MemoryRecord> =
      Promise.withResolvers()
    try {
      const existing = kept.find(predicate)
      if (existing) {
        resolve(existing)
        return promise
      }
    } catch (error) {
      reject(error)
      return promise
    }
    const waiter: Waiter = {
      predicate,
      reject,
      resolve,
      timer: setTimeout(() => {
        waiters.delete(waiter)
        reject(
          new Error(
            `[logixlysia] memory transport: no record matched within ${timeoutMs}ms; ${describeSeen(kept)}`
          )
        )
      }, timeoutMs)
    }
    waiters.add(waiter)
    return promise
  }

  return {
    clear: () => {
      kept = []
    },
    filter: predicate => kept.filter(predicate),
    find: predicate => kept.find(predicate),
    last: () => kept.at(-1),
    log: (level, message, meta) => {
      const record = toMemoryRecord(level, message, meta)
      kept.push(record)
      if (kept.length > maxRecords) {
        kept = kept.slice(kept.length - maxRecords)
      }
      offer(record)
    },
    get records() {
      return [...kept]
    },
    waitFor
  }
}
