import { describe, expect, mock, test } from 'bun:test'

import { createRequestContextStore } from '../../src/context/request-context'
import { createLogger } from '../../src/logger'
import {
  createWsHandlerWrapper,
  type WebSocketLike
} from '../../src/websocket/wrap-ws'

type TransportMock = ReturnType<
  typeof mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>
>

const setup = () => {
  const transport: TransportMock = mock(() => {
    /* noop */
  })
  const contextStore = createRequestContextStore()
  const logger = createLogger(
    {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }]
      }
    },
    undefined,
    contextStore
  )
  const wrapWs = createWsHandlerWrapper({}, logger, contextStore)
  return { contextStore, transport, wrapWs }
}

const messagesFrom = (transport: TransportMock): string[] =>
  transport.mock.calls.map(call => String(call[1]))

const contextFrom = (
  transport: TransportMock,
  callIndex: number
): Record<string, unknown> => {
  const meta = transport.mock.calls[callIndex]?.[2] as
    | { context: Record<string, unknown> }
    | undefined
  return meta?.context ?? {}
}

describe('wrapWs', () => {
  test('logs WebSocket open and close through transports', () => {
    const { transport, wrapWs } = setup()
    const ws = { id: 'ws-1' }

    const hooks = wrapWs('/chat', {
      close(_ws) {
        /* noop */
      },
      message(_ws, _message) {
        /* noop */
      },
      open(_ws) {
        /* noop */
      }
    })

    hooks.open(ws)
    hooks.message(ws, { hello: 'world' })
    hooks.close(ws)

    expect(transport).toHaveBeenCalledTimes(3)
    const messages = messagesFrom(transport)
    expect(messages).toContain('WebSocket opened')
    expect(messages).toContain('WebSocket message')
    expect(messages).toContain('WebSocket closed')
  })

  test('forwards close code and reason to the hook and logs them', () => {
    const { transport, wrapWs } = setup()
    const ws = { id: 'ws-1' }
    const closeHook = mock<
      (ws: WebSocketLike, code?: number, reason?: string) => void
    >(() => {
      /* noop */
    })

    const hooks = wrapWs('/chat', { close: closeHook })

    hooks.close(ws, 1001, 'going away')

    expect(closeHook).toHaveBeenCalledWith(ws, 1001, 'going away')
    const context = contextFrom(transport, 0)
    expect(context.code).toBe(1001)
    expect(context.reason).toBe('going away')
  })
})
