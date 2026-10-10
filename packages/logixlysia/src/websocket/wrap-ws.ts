import { keyOf } from '../context/request-context'
import type { RequestContextStore } from '../context/request-context'
import type { Logger, Options, StoreData } from '../interfaces'

export interface WebSocketLike {
  readonly data?: { store?: { logger?: Logger } }
  readonly id?: string
  readonly raw?: object
}

export interface WsHandlerHooks<
  TMessage = unknown,
  TWs extends WebSocketLike = WebSocketLike
> {
  close?: (ws: TWs, code?: number, reason?: string) => unknown
  message?: (ws: TWs, message: TMessage) => unknown
  open?: (ws: TWs) => unknown
}

// Synthetic requests are only read (method/url) by the log pipeline, never mutated, so caching
// one per path avoids allocating a fresh Request on every WS open/message/close log event.
const wsRequestCache = new Map<string, Request>()

const wsSyntheticRequest = (path: string): Request => {
  let request = wsRequestCache.get(path)
  if (!request) {
    request = new Request(`http://logixlysia.local${path}`, { method: 'WS' })
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

/** Runs `done` once `pending` settles, then hands the value or the failure on untouched. */
const settleHook = async (
  pending: Promise<unknown>,
  done: () => void
): Promise<unknown> => {
  let value: unknown
  try {
    value = await pending
  } catch (error) {
    done()
    throw error
  }
  done()
  return value
}

/**
 * Hands the hook's result back to Elysia untouched, so a returned value is
 * sent, a generator is iterated and a rejection reaches Elysia's catch. The
 * lifecycle line is written once the result has settled. The `instanceof
 * Promise` test is the one Elysia itself uses (`ws/index.mjs:116`).
 */
const afterHook = (result: unknown, done: () => void): unknown => {
  if (result instanceof Promise) {
    return settleHook(result, done)
  }
  done()
  return result
}

export const createWsHandlerWrapper = (
  options: Options,
  logger: Logger,
  contextStore: RequestContextStore
) => {
  const wsTimings = new WeakMap<object, bigint>()

  const logWs = (
    level: 'INFO' | 'WARNING' | 'ERROR',
    ws: WebSocketLike,
    path: string,
    message: string,
    extra?: Record<string, unknown>
  ): void => {
    const beforeTime = wsTimings.get(keyOf(ws)) ?? process.hrtime.bigint()
    const store: StoreData = { beforeTime }
    // Read-only: immediately spread below into a new object, never retained or mutated.
    const accumulated = contextStore.peekContext(ws)
    const context =
      Object.keys(accumulated).length > 0 || extra
        ? { ...accumulated, ...extra, wsId: ws.id }
        : { wsId: ws.id }

    logger.log(
      level,
      wsSyntheticRequest(path),
      { context, message, status: 200 },
      store
    )
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
        const done = (): void => {
          if (options.config?.disableWebSocketLogging !== true) {
            const extra: Record<string, unknown> = {}
            if (code !== undefined) {
              extra.code = code
            }
            if (reason !== undefined) {
              extra.reason = reason
            }
            logWs(
              'INFO',
              ws,
              path,
              'WebSocket closed',
              Object.keys(extra).length > 0 ? extra : undefined
            )
          }
          contextStore.clearContext(ws)
          wsTimings.delete(keyOf(ws))
        }
        let result: unknown
        try {
          result = hooks.close?.(ws, code, reason)
        } catch (error) {
          done()
          throw error
        }
        return afterHook(result, done)
      },
      message(ws, message) {
        const done = (): void => {
          if (options.config?.disableWebSocketLogging !== true) {
            logWs('INFO', ws, path, 'WebSocket message', {
              payloadType: payloadTypeOf(message)
            })
          }
        }
        let result: unknown
        try {
          result = hooks.message?.(ws, message)
        } catch (error) {
          done()
          throw error
        }
        return afterHook(result, done)
      },
      open(ws) {
        wsTimings.set(keyOf(ws), process.hrtime.bigint())
        const done = (): void => {
          if (options.config?.disableWebSocketLogging !== true) {
            logWs('INFO', ws, path, 'WebSocket opened')
          }
        }
        let result: unknown
        try {
          result = hooks.open?.(ws)
        } catch (error) {
          done()
          throw error
        }
        return afterHook(result, done)
      }
    } as THooks
  }
}
