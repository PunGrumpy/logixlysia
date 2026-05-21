import { describe, expect, mock, test } from 'bun:test'

import { createRequestContextStore } from '../../src/context/request-context'
import { createLogger } from '../../src/logger'
import { createWsHandlerWrapper } from '../../src/websocket/wrap-ws'

describe('wrapWs', () => {
  test('logs WebSocket open and close through transports', () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    })
    const contextStore = createRequestContextStore()
    const logger = createLogger(
      {
        config: {
          transports: [{ log: transport }],
          disableInternalLogger: true,
          disableFileLogging: true
        }
      },
      undefined,
      contextStore
    )
    const wrapWs = createWsHandlerWrapper({}, logger, contextStore)
    const ws = { id: 'ws-1' }

    const hooks = wrapWs('/chat', {
      open(_ws) {
        /* noop */
      },
      message(_ws, _message) {
        /* noop */
      },
      close(_ws) {
        /* noop */
      }
    })

    hooks.open?.(ws)
    hooks.message?.(ws, { hello: 'world' })
    hooks.close?.(ws)

    expect(transport).toHaveBeenCalledTimes(3)
    const messages = transport.mock.calls.map(call => String(call[1]))
    expect(messages).toContain('WebSocket opened')
    expect(messages).toContain('WebSocket message')
    expect(messages).toContain('WebSocket closed')
  })
})
