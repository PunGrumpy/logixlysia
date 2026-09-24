import type { AdapterTransport } from './adapters/shared'
import type { LogLevel, Transport } from './interfaces'

/**
 * Neural PII redaction at the transport boundary, for models such as
 * [`@desert-ant-labs/redact`](https://desertant.com/models/redact/).
 *
 * The built-in `autoRedact` pass is synchronous and pattern-based: it masks
 * emails, IPs, Luhn-valid card numbers, JWTs and sensitive keys, but it cannot
 * see free-text PII — names, street addresses, phone numbers, national IDs. A
 * token-classification model can, at the cost of being asynchronous and orders
 * of magnitude slower per string, which rules it out of the per-request hot
 * path that feeds the console.
 *
 * This subpath applies such a model where the cost is affordable and the risk
 * is real: on records leaving the process. Console output stays as fast as it
 * was; everything shipped to a transport is masked first.
 *
 * The model is injected, so logixlysia takes no dependency on it and any
 * structurally compatible redactor works.
 *
 * ```ts
 * import { Redact } from '@desert-ant-labs/redact/native'
 * import { withRedaction } from 'logixlysia/desertant'
 *
 * const axiom = createAxiomTransport()
 *
 * logixlysia({
 *   config: {
 *     autoRedact: true,                          // fast pass, every record
 *     transports: [withRedaction(axiom, Redact.load)] // model pass, shipped records
 *   }
 * })
 * ```
 */

/** Number of nested levels of `meta` walked before values pass through as-is. */
const DEFAULT_MAX_DEPTH = 4
/** Records allowed to wait for the model before new ones are dropped. */
const DEFAULT_MAX_QUEUE = 1000

const CIRCULAR_REF = '[Circular]'

/** Detection options passed through to the model, mirroring Redact's `Options`. */
export interface NeuralCallOptions {
  /** Call-group id, so one record bills as a single call. Set by the wrapper. */
  group?: string
  /** Restrict redaction to these PII labels. Omit for the model's defaults. */
  labels?: Iterable<string>
  /** Neural confidence threshold, `0..1`. Deterministic recognizers always apply. */
  minimumConfidence?: number
}

/**
 * The part of `@desert-ant-labs/redact`'s `Redact` this wrapper uses. Declared
 * structurally so the package is never imported here, and so a stub, a
 * different model, or a remote service can be substituted in tests.
 */
export interface NeuralRedactor {
  redaction: (
    text: string,
    options?: NeuralCallOptions
  ) => Promise<{ redactedText: string }>
  /** Groups the calls made inside `body` into a single billed call, when supported. */
  withCallGroup?: <T>(body: (group: string) => Promise<T>) => Promise<T>
}

/**
 * A redactor, a promise for one, or a loader called once on the first record —
 * `Redact.load` can be passed directly, keeping model download off the boot path.
 */
export type NeuralRedactorSource =
  | (() => NeuralRedactor | Promise<NeuralRedactor>)
  | NeuralRedactor
  | Promise<NeuralRedactor>

export interface NeuralRedactionOptions {
  /**
   * Also walk `meta` and redact the strings inside it. Turning this off leaves
   * structured fields untouched and only masks the log message.
   * @default true
   */
  includeMeta?: boolean
  /** Restrict redaction to these PII labels. Omit for the model's defaults. */
  labels?: Iterable<string>
  /**
   * Nested levels of `meta` walked. Deeper values pass through unredacted.
   * @default 4
   */
  maxDepth?: number
  /**
   * Records allowed to wait for the model at once. Beyond this, records are
   * dropped and reported to {@link NeuralRedactionOptions.onError} rather than
   * queued without bound — redaction is far slower than logging, so a burst
   * must not grow the queue until the process runs out of memory. A dropped
   * record is never forwarded unredacted, whatever `onFailure` says.
   * @default 1000
   */
  maxQueue?: number
  /** Neural confidence threshold, `0..1`. Deterministic recognizers always apply. */
  minimumConfidence?: number
  /** Called when loading or redaction fails, and when a record is dropped. */
  onError?: (error: unknown) => void
  /**
   * What to do with a record the model could not process. `'drop'` keeps the
   * failure closed: an unredacted record never reaches the transport. Choose
   * `'forward'` only when losing the log is worse than shipping raw PII.
   * @default 'drop'
   */
  onFailure?: 'drop' | 'forward'
}

/** A {@link Transport} whose records pass through the model before delivery. */
export interface RedactingTransport extends Transport {
  /** Awaits the records already queued, then flushes the wrapped transport. */
  flush: () => Promise<void>
}

interface WalkContext {
  callOptions: NeuralCallOptions
  maxDepth: number
  redactor: NeuralRedactor
  seen: ReadonlySet<object>
}

const resolveRedactor = (
  source: NeuralRedactorSource
): Promise<NeuralRedactor> =>
  Promise.resolve(typeof source === 'function' ? source() : source)

/**
 * Resolves the source once. A rejected load stays rejected: retrying on every
 * record would hammer the model host, and the failure is reported per record
 * through `onError` either way.
 */
const memoizeRedactor = (
  source: NeuralRedactorSource
): (() => Promise<NeuralRedactor>) => {
  let cached: Promise<NeuralRedactor> | undefined
  return () => {
    cached ??= resolveRedactor(source)
    return cached
  }
}

const withCallGroup = <T>(
  redactor: NeuralRedactor,
  body: (group?: string) => Promise<T>
): Promise<T> => {
  if (redactor.withCallGroup === undefined) {
    return body()
  }
  return redactor.withCallGroup(group => body(group))
}

const redactText = async (
  text: string,
  { callOptions, redactor }: WalkContext
): Promise<string> => {
  if (text.length === 0) {
    return text
  }
  const { redactedText } = await redactor.redaction(text, callOptions)
  return redactedText
}

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value) as object | null
  return proto === Object.prototype || proto === null
}

/**
 * Mutually recursive. One object lets each walker reach the others by
 * property instead of by a binding declared later in the file.
 */
const walker = {
  entries: async (
    record: Record<string, unknown>,
    context: WalkContext,
    depth: number
  ): Promise<Record<string, unknown>> => {
    const entries = await Promise.all(
      Object.entries(record).map(
        async ([key, value]) =>
          [key, await walker.value(value, context, depth + 1)] as const
      )
    )
    return Object.fromEntries(entries)
  },

  /**
   * Errors are rebuilt rather than mutated: the message and stack of a failed
   * request are exactly where free-text PII ("user Anna Müller not found") tends
   * to surface, and the original instance must stay untouched for the rest of
   * the pipeline.
   */
  error: async (
    original: Error,
    context: WalkContext,
    depth: number
  ): Promise<Error> => {
    const clone = Object.create(
      Object.getPrototypeOf(original) as object
    ) as Error & Record<string, unknown>
    clone.name = original.name
    clone.message = await redactText(original.message, context)
    if (original.stack !== undefined) {
      clone.stack = await redactText(original.stack, context)
    }

    const record = original as unknown as Record<string, unknown>
    const ownKeys = Object.getOwnPropertyNames(original).filter(
      key => key !== 'message' && key !== 'name' && key !== 'stack'
    )
    const values = await Promise.all(
      ownKeys.map(key => walker.value(record[key], context, depth + 1))
    )
    for (const [index, key] of ownKeys.entries()) {
      clone[key] = values[index]
    }
    return clone
  },

  object: async (
    value: object,
    context: WalkContext,
    depth: number
  ): Promise<unknown> => {
    if (context.seen.has(value)) {
      return CIRCULAR_REF
    }

    const childContext: WalkContext = {
      ...context,
      seen: new Set(context.seen).add(value)
    }
    if (Array.isArray(value)) {
      return await Promise.all(
        value.map(item => walker.value(item, childContext, depth + 1))
      )
    }
    if (value instanceof Error) {
      return await walker.error(value, childContext, depth)
    }
    if (isPlainObject(value)) {
      return await walker.entries(
        value as Record<string, unknown>,
        childContext,
        depth
      )
    }
    // Dates, Maps, class instances and the like: no safe generic way to rebuild
    // them, so they pass through. Flatten anything that can carry free-text PII
    // into plain fields before it reaches the transport.
    return value
  },

  value: (
    value: unknown,
    context: WalkContext,
    depth: number
  ): Promise<unknown> => {
    if (typeof value === 'string') {
      return redactText(value, context)
    }
    if (value === null || typeof value !== 'object') {
      return Promise.resolve(value)
    }
    if (depth >= context.maxDepth) {
      return Promise.resolve(value)
    }
    return walker.object(value, context, depth)
  }
}

interface Queue {
  drain: () => Promise<void>
  push: (task: () => Promise<void>) => boolean
}

/**
 * Serializes redaction. One model instance holds one native handle, and the
 * console has already printed these records in order, so the transport should
 * receive them in order too rather than in whatever order inference finishes.
 */
const createQueue = (maxQueue: number): Queue => {
  let tail: Promise<void> = Promise.resolve()
  let pending = 0

  // Like `prior.then(task)`: a rejected `prior` skips `task`.
  const runAfter = async (
    prior: Promise<void>,
    task: () => Promise<void>
  ): Promise<void> => {
    try {
      await prior
      await task()
    } finally {
      pending -= 1
    }
  }

  return {
    drain: () => tail,
    push: (task: () => Promise<void>): boolean => {
      if (pending >= maxQueue) {
        return false
      }
      pending += 1
      tail = runAfter(tail, task)
      return true
    }
  }
}

const queueFullError = (maxQueue: number): Error =>
  new Error(
    `[logixlysia] desertant: ${maxQueue} records already awaiting redaction; record dropped`
  )

/**
 * Wraps a transport so every record is passed through a PII model before it is
 * delivered. Redaction runs off the request path — {@link Transport.log}
 * returns immediately and the record is delivered once the model is done, in
 * the order it was logged.
 *
 * The wrapper fails closed by default: a record the model could not process is
 * dropped and reported through `onError`, never forwarded unredacted.
 *
 * @param transport The transport to protect. Its `flush`, if any, is preserved.
 * @param source The model, a promise for it, or a loader run on the first record.
 */
export const withRedaction = (
  transport: Transport,
  source: NeuralRedactorSource,
  options: NeuralRedactionOptions = {}
): RedactingTransport => {
  const {
    includeMeta = true,
    labels,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxQueue = DEFAULT_MAX_QUEUE,
    minimumConfidence,
    onError,
    onFailure = 'drop'
  } = options

  const getRedactor = memoizeRedactor(source)
  const queue = createQueue(maxQueue)

  const report = (error: unknown): void => {
    if (onError === undefined) {
      return
    }
    try {
      onError(error)
    } catch {
      // A reporting hook that throws must not take the log pipeline with it.
    }
  }

  const deliver = async (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): Promise<void> => {
    await transport.log(level, message, meta)
  }

  const redactRecord = async (
    redactor: NeuralRedactor,
    message: string,
    meta: Record<string, unknown> | undefined,
    group?: string
  ): Promise<{ message: string; meta?: Record<string, unknown> }> => {
    const context: WalkContext = {
      callOptions: { group, labels, minimumConfidence },
      maxDepth,
      redactor,
      seen: new Set(meta === undefined ? [] : [meta])
    }
    return {
      message: await redactText(message, context),
      meta:
        includeMeta && meta !== undefined
          ? await walker.entries(meta, context, 0)
          : meta
    }
  }

  const log = (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): void => {
    const accepted = queue.push(async () => {
      let redacted: { message: string; meta?: Record<string, unknown> }
      try {
        const redactor = await getRedactor()
        redacted = await withCallGroup(redactor, group =>
          redactRecord(redactor, message, meta, group)
        )
      } catch (error) {
        report(error)
        if (onFailure === 'forward') {
          try {
            await deliver(level, message, meta)
          } catch (deliveryError) {
            report(deliveryError)
          }
        }
        return
      }

      try {
        await deliver(level, redacted.message, redacted.meta)
      } catch (error) {
        report(error)
      }
    })

    if (!accepted) {
      report(queueFullError(maxQueue))
    }
  }

  return {
    flush: async () => {
      await queue.drain()
      await (transport as Partial<AdapterTransport>).flush?.()
    },
    log
  }
}
