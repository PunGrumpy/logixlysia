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
  close?: (ws: TWs, code?: number, reason?: string) => void
  message?: (ws: TWs, message: TMessage) => void
  open?: (ws: TWs) => void
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

// Elysia passes a new wrapper per event; only `raw` is the same for the whole connection.
const connectionKey = (ws: WebSocketLike): object => ws.raw ?? ws

const payloadTypeOf = (message: unknown): string => {
  if (message instanceof ArrayBuffer || ArrayBuffer.isView(message)) {
    return 'binary'
  }
  if (typeof message === 'string') {
    return 'string'
  }
  return typeof message
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
    const beforeTime =
      wsTimings.get(connectionKey(ws)) ?? process.hrtime.bigint()
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
        try {
          hooks.close?.(ws, code, reason)
        } finally {
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
          contextStore.clearContext(ws as object)
          wsTimings.delete(connectionKey(ws))
        }
      },
      message(ws, message) {
        try {
          hooks.message?.(ws, message)
        } finally {
          if (options.config?.disableWebSocketLogging !== true) {
            logWs('INFO', ws, path, 'WebSocket message', {
              payloadType: payloadTypeOf(message)
            })
          }
        }
      },
      open(ws) {
        wsTimings.set(connectionKey(ws), process.hrtime.bigint())
        try {
          hooks.open?.(ws)
        } finally {
          if (options.config?.disableWebSocketLogging !== true) {
            logWs('INFO', ws, path, 'WebSocket opened')
          }
        }
      }
    } as THooks
  }
}
