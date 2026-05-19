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
  close?: (ws: TWs) => void
  message?: (ws: TWs, message: TMessage) => void
  open?: (ws: TWs) => void
}

const wsSyntheticRequest = (path: string): Request =>
  new Request(`http://logixlysia.local${path}`, { method: 'WS' })

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
    const accumulated = contextStore.getContext(key)
    const context =
      Object.keys(accumulated).length > 0 || extra
        ? { ...accumulated, ...extra, wsId: ws.id }
        : { wsId: ws.id }

    logger.log(
      level,
      wsSyntheticRequest(path),
      { message, context, status: 200 },
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
      open(ws) {
        wsTimings.set(ws as object, process.hrtime.bigint())
        hooks.open?.(ws)
        if (options.config?.disableWebSocketLogging !== true) {
          logWs('INFO', ws, path, 'WebSocket opened')
        }
      },
      message(ws, message) {
        hooks.message?.(ws, message)
        if (options.config?.disableWebSocketLogging !== true) {
          logWs('INFO', ws, path, 'WebSocket message', {
            payloadType: typeof message
          })
        }
      },
      close(ws) {
        hooks.close?.(ws)
        if (options.config?.disableWebSocketLogging !== true) {
          logWs('INFO', ws, path, 'WebSocket closed')
        }
        contextStore.clearContext(ws as object)
        wsTimings.delete(ws as object)
      }
    }) as THooks
}
