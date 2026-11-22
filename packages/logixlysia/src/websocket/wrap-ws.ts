import { keyOf } from '../context/request-context'
import type {
  ContextKey,
  RequestContextStore
} from '../context/request-context'
import type { Logger, Options, StoreData } from '../interfaces'
import { reportFormatError } from '../logger/emit'
import { resolvePathFilter } from '../logger/path-filter'
import type { PathFilter } from '../logger/path-filter'
import { normalizeLoggedError } from '../utils/error'
import { syntheticRequest } from '../utils/synthetic-request'

export interface WebSocketLike {
  /** Elysia 1.x hands a socket its context here. */
  readonly data?: { store?: { logger?: Logger } }
  readonly id?: string
  readonly raw?: object
  /** Elysia 2 puts the context on the socket itself. */
  readonly store?: { logger?: Logger }
}

export interface WsHandlerHooks<
  TMessage = unknown,
  TWs extends WebSocketLike = WebSocketLike
> {
  close?: (ws: TWs, code?: number, reason?: string) => unknown
  message?: (ws: TWs, message: TMessage) => unknown
  open?: (ws: TWs) => unknown
}

// Boxed so that a hook which throws `undefined` still counts as a failure.
interface HookFailure {
  error: unknown
}

type Settle = (failure?: HookFailure) => void

const wsRequestCache = new Map<string, Request>()

const wsSyntheticRequest = (path: string): Request => {
  let request = wsRequestCache.get(path)
  if (!request) {
    request = syntheticRequest('WS', path)
    wsRequestCache.set(path, request)
  }
  return request
}

const payloadTypeOf = (message: unknown): string => {
  try {
    if (message instanceof ArrayBuffer || ArrayBuffer.isView(message)) {
      return 'binary'
    }
  } catch {
    // A revoked Proxy throws on `instanceof`; it is still an object.
  }
  if (typeof message === 'string') {
    return 'string'
  }
  return typeof message
}

// `finally` writes the line once, whether the source finishes, throws or is
// stopped early by the consumer.
const settleIterator = function* settleIterator(
  source: Generator<unknown, unknown>,
  done: Settle
): Generator<unknown, unknown> {
  let failure: HookFailure | undefined
  try {
    return yield* { [Symbol.iterator]: () => source }
  } catch (error) {
    failure = { error }
    throw error
  } finally {
    done(failure)
  }
}

const settleAsyncIterator = async function* settleAsyncIterator(
  source: AsyncGenerator<unknown, unknown>,
  done: Settle
): AsyncGenerator<unknown, unknown> {
  let failure: HookFailure | undefined
  try {
    return yield* { [Symbol.asyncIterator]: () => source }
  } catch (error) {
    failure = { error }
    throw error
  } finally {
    done(failure)
  }
}

type GeneratorKind = 'async' | 'sync'

// The intrinsic prototypes every generator of this realm inherits from.
const GENERATOR_PROTOTYPE: object = Object.getPrototypeOf(
  settleIterator.prototype
)
const ASYNC_GENERATOR_PROTOTYPE: object = Object.getPrototypeOf(
  settleAsyncIterator.prototype
)

// Only a generator exactly as a `function*` made it is wrapped: properties
// of its own, or on its function's `prototype`, can change how it iterates,
// and Elysia calls both `next()` and the iterator method.
const generatorKindOf = (value: unknown): GeneratorKind | undefined => {
  if (typeof value !== 'object' || value === null) {
    return
  }
  try {
    const own: unknown = Object.getPrototypeOf(value)
    if (typeof own !== 'object' || own === null) {
      return
    }
    if (Reflect.ownKeys(value).length > 0 || Reflect.ownKeys(own).length > 0) {
      return
    }
    const intrinsic: unknown = Object.getPrototypeOf(own)
    if (intrinsic === GENERATOR_PROTOTYPE) {
      return 'sync'
    }
    if (intrinsic === ASYNC_GENERATOR_PROTOTYPE) {
      return 'async'
    }
  } catch {
    // A revoked Proxy cannot be inspected; it is handed on as it is.
  }
}

type SettleValue = (value: unknown, done: Settle) => unknown

const settleNow: SettleValue = (value, done) => {
  done()
  return value
}

// Used for a hook's direct result and for what a Promise resolved to, since
// Elysia iterates a generator in either case. A generator runs after the hook
// returns, so its line waits for the last value.
const settleValue: SettleValue = (value, done) => {
  const kind = generatorKindOf(value)
  if (kind === 'sync') {
    return settleIterator(value as Generator<unknown, unknown>, done)
  }
  if (kind === 'async') {
    return settleAsyncIterator(value as AsyncGenerator<unknown, unknown>, done)
  }
  return settleNow(value, done)
}

const settleHook = async (
  pending: Promise<unknown>,
  done: Settle,
  settle: SettleValue
): Promise<unknown> => {
  let value: unknown
  try {
    value = await pending
  } catch (error) {
    done({ error })
    throw error
  }
  return settle(value, done)
}

// `instanceof Promise` is the test Elysia uses (`createHandleWSResponse`).
// A revoked Proxy throws on it; that value is not a Promise, and the throw
// must not replace the hook's result.
const isPromise = (value: unknown): boolean => {
  try {
    return value instanceof Promise
  } catch {
    return false
  }
}

/**
 * Hands the hook's result back to Elysia in a form it treats the same way, so
 * a returned value is sent, a generator is iterated and a rejection reaches
 * Elysia's catch. The lifecycle line is written once the result has settled.
 */
const afterHook = (
  result: unknown,
  done: Settle,
  settle: SettleValue = settleValue
): unknown =>
  isPromise(result)
    ? settleHook(result as Promise<unknown>, done, settle)
    : settle(result, done)

export const createWsHandlerWrapper = (
  options: Options,
  logger: Logger,
  contextStore: RequestContextStore,
  pathFilter: PathFilter | undefined = resolvePathFilter(
    options.config?.logFilter
  )
) => {
  const wsTimings = new WeakMap<ContextKey, bigint>()
  // Elysia keeps pulling a message hook's generator after the socket closes,
  // so its line can come after the close has cleared the context.
  const closedContexts = new WeakMap<
    ContextKey,
    Readonly<Record<string, unknown>>
  >()

  const logWs = (
    ws: WebSocketLike,
    key: ContextKey,
    path: string,
    message: string,
    extra: Record<string, unknown> | undefined,
    failure: HookFailure | undefined
  ): void => {
    const request = wsSyntheticRequest(path)
    if (pathFilter?.excludes(request)) {
      return
    }
    const beforeTime = wsTimings.get(key) ?? process.hrtime.bigint()
    const store: StoreData = { beforeTime }
    const closed = closedContexts.get(key)
    const live = contextStore.peekContext(ws)
    const accumulated = closed ? { ...closed, ...live } : live
    const wsId = ws.id
    const context =
      Object.keys(accumulated).length > 0 || extra
        ? { ...accumulated, ...extra, wsId }
        : { wsId }

    if (!failure) {
      logger.log('INFO', request, { context, message, status: 200 }, store)
      return
    }
    // No status: a failed hook sends the client none, as with a line from
    // `log.error`.
    const { error } = normalizeLoggedError(
      failure.error,
      options.config?.logErrorPayload === true
    )
    logger.log('ERROR', request, { context, error, message }, store)
  }

  const reportSettleFailure = (failure: unknown): void => {
    reportFormatError(failure, options.config?.onError)
  }

  // Read once the hook is done: a socket that cannot be read must not
  // keep the hook from running or replace its error.
  const keyAfterHook = (ws: WebSocketLike): ContextKey | undefined => {
    try {
      return keyOf(ws)
    } catch (failure) {
      reportSettleFailure(failure)
    }
  }

  // Runs while the hook's own result or error is on its way to Elysia, so a
  // failure here is reported and never thrown in its place.
  const writeLine = (
    ws: WebSocketLike,
    key: ContextKey,
    path: string,
    message: string,
    extra?: Record<string, unknown>,
    failure?: HookFailure
  ): void => {
    try {
      if (options.config?.disableWebSocketLogging !== true) {
        logWs(ws, key, path, message, extra, failure)
      }
    } catch (reportFailure) {
      reportSettleFailure(reportFailure)
    }
    try {
      if (closedContexts.has(key)) {
        // Whatever was merged after the close went into the line above.
        contextStore.clearContext(ws)
      }
    } catch (cleanupFailure) {
      reportSettleFailure(cleanupFailure)
    }
  }

  return <
    TMessage,
    TWs extends WebSocketLike,
    const THooks extends WsHandlerHooks<TMessage, TWs>
  >(
    path: string,
    hooks: THooks
  ): THooks => {
    if (typeof path !== 'string') {
      throw new TypeError(
        "logixlysia: wrapWs(path, hooks) expects the route path first, e.g. plugin.wrapWs('/chat', { open(ws) {} })"
      )
    }
    return {
      ...hooks,
      close(ws, code, reason) {
        const extra: Record<string, unknown> = {}
        if (code !== undefined) {
          extra.code = code
        }
        if (reason !== undefined) {
          extra.reason = reason
        }
        const done: Settle = failure => {
          const key = keyAfterHook(ws)
          if (key === undefined) {
            return
          }
          writeLine(
            ws,
            key,
            path,
            'WebSocket closed',
            Object.keys(extra).length > 0 ? extra : undefined,
            failure
          )
          // The open time stays, for a message line written after this one.
          try {
            closedContexts.set(key, contextStore.peekContext(ws))
            contextStore.clearContext(ws)
          } catch (cleanupFailure) {
            reportSettleFailure(cleanupFailure)
          }
        }
        let result: unknown
        try {
          result = hooks.close?.(ws, code, reason)
        } catch (error) {
          done({ error })
          throw error
        }
        // Elysia may never pull a generator returned here (it stops at a
        // frame it cannot send), and the close must not wait on it.
        return afterHook(result, done, settleNow)
      },
      message(ws, message) {
        // Read now: the hook may change or revoke the message it is given.
        const extra = { payloadType: payloadTypeOf(message) }
        const done: Settle = failure => {
          if (options.config?.disableWebSocketLogging === true) {
            return
          }
          const key = keyAfterHook(ws)
          if (key === undefined) {
            return
          }
          writeLine(ws, key, path, 'WebSocket message', extra, failure)
        }
        let result: unknown
        try {
          result = hooks.message?.(ws, message)
        } catch (error) {
          done({ error })
          throw error
        }
        return afterHook(result, done)
      },
      open(ws) {
        const key = keyOf(ws)
        wsTimings.set(key, process.hrtime.bigint())
        closedContexts.delete(key)
        const done: Settle = failure => {
          writeLine(ws, key, path, 'WebSocket opened', undefined, failure)
        }
        let result: unknown
        try {
          result = hooks.open?.(ws)
        } catch (error) {
          done({ error })
          throw error
        }
        return afterHook(result, done)
      }
    } as THooks
  }
}
