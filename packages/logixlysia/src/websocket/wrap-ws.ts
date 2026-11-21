import { keyOf } from '../context/request-context'
import type { RequestContextStore } from '../context/request-context'
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
  if (message instanceof ArrayBuffer || ArrayBuffer.isView(message)) {
    return 'binary'
  }
  if (typeof message === 'string') {
    return 'string'
  }
  return typeof message
}

const isIterator = (
  value: unknown
): value is AsyncIterator<unknown> | Iterator<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { next?: unknown }).next === 'function' &&
  (Symbol.asyncIterator in value || Symbol.iterator in value)

// `finally` writes the line once, whether the source finishes, throws or is
// stopped early by the consumer.
const settleIterator = function* settleIterator(
  source: Iterator<unknown>,
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
  source: AsyncIterator<unknown>,
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

// Used for a hook's direct result and for what a Promise resolved to, since
// Elysia iterates an iterator in either case. A returned iterator is pulled
// after the hook returns, so its line waits for the last value.
const settleValue = (value: unknown, done: Settle): unknown => {
  if (isIterator(value)) {
    return Symbol.asyncIterator in value
      ? settleAsyncIterator(value as AsyncIterator<unknown>, done)
      : settleIterator(value as Iterator<unknown>, done)
  }
  done()
  return value
}

const settleHook = async (
  pending: Promise<unknown>,
  done: Settle
): Promise<unknown> => {
  let value: unknown
  try {
    value = await pending
  } catch (error) {
    done({ error })
    throw error
  }
  return settleValue(value, done)
}

/**
 * Hands the hook's result back to Elysia in a form it treats the same way, so
 * a returned value is sent, a generator is iterated and a rejection reaches
 * Elysia's catch. The lifecycle line is written once the result has settled.
 * The `instanceof Promise` and `next` tests are the ones Elysia itself uses
 * (`createHandleWSResponse` in `elysia/dist/ws/index.mjs`).
 */
const afterHook = (result: unknown, done: Settle): unknown =>
  result instanceof Promise
    ? settleHook(result, done)
    : settleValue(result, done)

export const createWsHandlerWrapper = (
  options: Options,
  logger: Logger,
  contextStore: RequestContextStore,
  pathFilter: PathFilter | undefined = resolvePathFilter(
    options.config?.logFilter
  )
) => {
  const wsTimings = new WeakMap<object, bigint>()
  // Elysia keeps pulling a message hook's iterator after the socket closes, so
  // its line can come after the close has cleared the context.
  const closedContexts = new WeakMap<
    object,
    Readonly<Record<string, unknown>>
  >()

  const logWs = (
    ws: WebSocketLike,
    path: string,
    message: string,
    extra?: Record<string, unknown>,
    failure?: HookFailure
  ): void => {
    const request = wsSyntheticRequest(path)
    if (pathFilter?.excludes(request)) {
      return
    }
    const beforeTime = wsTimings.get(keyOf(ws)) ?? process.hrtime.bigint()
    const store: StoreData = { beforeTime }
    const live = contextStore.peekContext(ws)
    const accumulated =
      Object.keys(live).length > 0
        ? live
        : (closedContexts.get(keyOf(ws)) ?? live)
    const context =
      Object.keys(accumulated).length > 0 || extra
        ? { ...accumulated, ...extra, wsId: ws.id }
        : { wsId: ws.id }

    if (!failure) {
      logger.log('INFO', request, { context, message, status: 200 }, store)
      return
    }
    // The hook's own error must still reach Elysia, so a value that cannot be
    // serialised is reported instead of thrown. No status: a failed hook sends
    // the client none, as with a line from `log.error`.
    try {
      const { error } = normalizeLoggedError(
        failure.error,
        options.config?.logErrorPayload === true
      )
      logger.log('ERROR', request, { context, error, message }, store)
    } catch (reportFailure) {
      reportFormatError(reportFailure, options.config?.onError)
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
        const done: Settle = failure => {
          if (options.config?.disableWebSocketLogging !== true) {
            const extra: Record<string, unknown> = {}
            if (code !== undefined) {
              extra.code = code
            }
            if (reason !== undefined) {
              extra.reason = reason
            }
            logWs(
              ws,
              path,
              'WebSocket closed',
              Object.keys(extra).length > 0 ? extra : undefined,
              failure
            )
          }
          // The open time stays, for a message line written after this one.
          closedContexts.set(keyOf(ws), contextStore.peekContext(ws))
          contextStore.clearContext(ws)
        }
        let result: unknown
        try {
          result = hooks.close?.(ws, code, reason)
        } catch (error) {
          done({ error })
          throw error
        }
        return afterHook(result, done)
      },
      message(ws, message) {
        const done: Settle = failure => {
          if (options.config?.disableWebSocketLogging !== true) {
            logWs(
              ws,
              path,
              'WebSocket message',
              { payloadType: payloadTypeOf(message) },
              failure
            )
          }
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
        wsTimings.set(keyOf(ws), process.hrtime.bigint())
        closedContexts.delete(keyOf(ws))
        const done: Settle = failure => {
          if (options.config?.disableWebSocketLogging !== true) {
            logWs(ws, path, 'WebSocket opened', undefined, failure)
          }
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
