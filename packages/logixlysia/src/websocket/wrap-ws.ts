import type { RequestContextStore } from '../context/request-context'
import type { Logger, Options, StoreData } from '../interfaces'

export interface WebSocketLike {
  readonly data?: { store?: { logger?: Logger } }
  readonly id?: string
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
    const key = ws as object
    const beforeTime = wsTimings.get(key) ?? process.hrtime.bigint()
    const store: StoreData = { beforeTime }
    // Read-only: immediately spread below into a new object, never retained or mutated.
    const accumulated = contextStore.peekContext(key)
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
  ): THooks =>
    ({
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
          wsTimings.delete(ws as object)
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
        wsTimings.set(ws as object, process.hrtime.bigint())
        try {
          hooks.open?.(ws)
        } finally {
          if (options.config?.disableWebSocketLogging !== true) {
            logWs('INFO', ws, path, 'WebSocket opened')
          }
        }
      }
    }) as THooks
}
