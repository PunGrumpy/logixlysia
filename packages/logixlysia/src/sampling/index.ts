import type {
  LogLevel,
  SamplingConfig,
  TailSamplingConfig
} from '../interfaces'
import { globToRegExp } from './glob'

const FULL_RATE = 100
const DEFAULT_MAX_BUFFERED_PER_REQUEST = 100

const NO_RECORDS: readonly BufferedRecord[] = Object.freeze([])

/**
 * What head sampling decided for a single record:
 *
 * - `keep` — emit now
 * - `buffer` — hold it until the request's tail verdict is known
 * - `drop` — discard it; no tail rule can bring it back
 */
export type SamplingDecision = 'buffer' | 'drop' | 'keep'

/** A head-dropped record held until its request's tail verdict is known. */
export interface BufferedRecord {
  data: Record<string, unknown>
  /** Elapsed time at capture, so a replayed record keeps its original duration. */
  durationMs: number
  level: LogLevel
}

/** How a request finished, matched against {@link TailSamplingConfig}. */
export interface RequestOutcome {
  durationMs: number
  pathname: string
  status: number
}

export interface SamplingRuntime {
  /** Marks a request as one that will reach {@link SamplingRuntime.finalize}. */
  begin: (key: object) => void
  /** Holds a head-dropped record, up to `maxBufferedPerRequest`. */
  buffer: (key: object, record: BufferedRecord) => void
  decide: (level: LogLevel, key: object) => SamplingDecision
  /**
   * Resolves the tail verdict for a finished request. Returns the records to
   * replay — empty when the outcome matched no tail rule — and marks a rescued
   * request so the caller's own final log bypasses head sampling too.
   */
  finalize: (key: object, outcome: RequestOutcome) => readonly BufferedRecord[]
}

interface ResolvedTail {
  durationMs?: number
  paths?: RegExp[]
  status?: number
}

const resolveTail = (
  tail: TailSamplingConfig | undefined
): ResolvedTail | undefined => {
  if (!tail) {
    return
  }

  const paths = tail.paths?.length ? tail.paths.map(globToRegExp) : undefined
  if (
    tail.durationMs === undefined &&
    tail.status === undefined &&
    paths === undefined
  ) {
    return
  }

  return { durationMs: tail.durationMs, paths, status: tail.status }
}

/** Tail rules are OR-ed: any single match rescues the whole request. */
const matchesTail = (tail: ResolvedTail, outcome: RequestOutcome): boolean => {
  if (tail.status !== undefined && outcome.status >= tail.status) {
    return true
  }
  if (tail.durationMs !== undefined && outcome.durationMs >= tail.durationMs) {
    return true
  }
  if (tail.paths) {
    for (const path of tail.paths) {
      if (path.test(outcome.pathname)) {
        return true
      }
    }
  }
  return false
}

/** Keeps only the rates that actually drop something. */
const resolveRates = (
  head: SamplingConfig['head']
): Partial<Record<LogLevel, number>> | undefined => {
  if (!head) {
    return
  }

  const rates: Partial<Record<LogLevel, number>> = {}
  let hasRate = false
  for (const [level, rate] of Object.entries(head)) {
    if (typeof rate === 'number' && rate < FULL_RATE) {
      rates[level as LogLevel] = rate
      hasRate = true
    }
  }

  return hasRate ? rates : undefined
}

/**
 * Builds the sampling runtime, or `undefined` when the config drops nothing —
 * tail rules alone are a no-op, since only head-dropped records are ever
 * buffered.
 *
 * @param random Injectable for deterministic tests; defaults to `Math.random`.
 */
export const resolveSampling = (
  config: SamplingConfig | undefined,
  random: () => number = Math.random
): SamplingRuntime | undefined => {
  const rates = resolveRates(config?.head)
  if (!rates) {
    return
  }

  const tail = resolveTail(config?.tail)
  const maxBuffered =
    config?.maxBufferedPerRequest ?? DEFAULT_MAX_BUFFERED_PER_REQUEST

  const buffers = new WeakMap<object, BufferedRecord[]>()
  // Only requests the plugin opened (and will close) may buffer: WebSocket
  // pseudo-requests and hand-rolled `createLogger` callers never finalize, so
  // buffering for them would grow without bound.
  const inFlight = new WeakSet<object>()
  const rescued = new WeakSet<object>()

  return {
    begin(key) {
      if (tail) {
        inFlight.add(key)
      }
    },

    buffer(key, record) {
      let bucket = buffers.get(key)
      if (!bucket) {
        bucket = []
        buffers.set(key, bucket)
      }
      if (bucket.length >= maxBuffered) {
        return
      }
      bucket.push(record)
    },

    decide(level, key) {
      if (rescued.has(key)) {
        return 'keep'
      }

      const rate = rates[level] ?? FULL_RATE
      if (rate >= FULL_RATE || (rate > 0 && random() * FULL_RATE < rate)) {
        return 'keep'
      }

      return tail && inFlight.has(key) ? 'buffer' : 'drop'
    },

    finalize(key, outcome) {
      inFlight.delete(key)
      const bucket = buffers.get(key)
      buffers.delete(key)

      if (!(tail && matchesTail(tail, outcome))) {
        return NO_RECORDS
      }

      rescued.add(key)
      return bucket ?? NO_RECORDS
    }
  }
}
