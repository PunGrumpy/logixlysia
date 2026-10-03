import { describe, expect, mock, test } from 'bun:test'
import { createRequestContextStore } from '../../src/context/request-context'
import { createLogger } from '../../src/logger'
import { createWsHandlerWrapper } from '../../src/websocket/wrap-ws'
import type { WebSocketLike, WsHandlerHooks } from '../../src/websocket/wrap-ws'
import { sleep } from '../_helpers/sleep'

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

interface LogRecord {
  context?: Record<string, unknown>
  durationMs?: number
}

const recordFrom = (transport: TransportMock, message: string): LogRecord => {
  const call = transport.mock.calls.find(entry => entry[1] === message)
  return (call?.[2] as LogRecord | undefined) ?? {}
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

  test('a throwing close hook still logs and clears the context', () => {
    const { contextStore, transport, wrapWs } = setup()
    const ws = { id: 'ws-1' }

    const hooks = wrapWs('/chat', {
      close(_ws) {
        throw new Error('boom')
      }
    })

    contextStore.mergeContext(ws, { a: 1 })

    expect(() => hooks.close(ws)).toThrow('boom')

    expect(messagesFrom(transport)).toContain('WebSocket closed')
    expect(contextStore.getContext(ws)).toEqual({})
  })

  test('a throwing open hook still logs', () => {
    const { transport, wrapWs } = setup()
    const ws = { id: 'ws-1' }

    const hooks = wrapWs('/chat', {
      open(_ws) {
        throw new Error('boom')
      }
    })

    expect(() => hooks.open(ws)).toThrow('boom')

    expect(messagesFrom(transport)).toContain('WebSocket opened')
  })

  test('reports binary frames as binary', () => {
    const { transport, wrapWs } = setup()
    const ws = { id: 'ws-1' }

    const hooks = wrapWs<unknown, WebSocketLike, WsHandlerHooks>('/chat', {})

    hooks.message?.(ws, new Uint8Array([1, 2]))
    hooks.message?.(ws, new ArrayBuffer(4))
    hooks.message?.(ws, 'hello')
    hooks.message?.(ws, { hello: 'world' })

    const payloadTypes = transport.mock.calls.map(
      (_call, index) => contextFrom(transport, index).payloadType
    )
    expect(payloadTypes).toEqual(['binary', 'binary', 'string', 'object'])
  })

  test('keeps context across distinct per-event wrappers and clears it on close', () => {
    const { contextStore, transport, wrapWs } = setup()
    const raw = {}
    const first = { id: 'ws-1', raw }
    const second = { id: 'ws-1', raw }
    const third = { id: 'ws-1', raw }

    const hooks = wrapWs<unknown, WebSocketLike, WsHandlerHooks>('/chat', {})

    hooks.open?.(first)
    contextStore.mergeContext(first, { room: 'lobby' })
    hooks.message?.(second, 'hi')
    hooks.close?.(third)

    expect(recordFrom(transport, 'WebSocket message').context?.room).toBe(
      'lobby'
    )
    expect(recordFrom(transport, 'WebSocket closed').context?.room).toBe(
      'lobby'
    )
    expect(contextStore.getContext(raw)).toEqual({})
  })

  test('times message and close lines from the open of the same connection', async () => {
    const { transport, wrapWs } = setup()
    const raw = {}
    const first = { id: 'ws-1', raw }
    const second = { id: 'ws-1', raw }
    const third = { id: 'ws-1', raw }

    const hooks = wrapWs<unknown, WebSocketLike, WsHandlerHooks>('/chat', {})

    hooks.open?.(first)
    await sleep(25)
    hooks.message?.(second, 'hi')
    await sleep(25)
    hooks.close?.(third)

    expect(
      recordFrom(transport, 'WebSocket message').durationMs
    ).toBeGreaterThanOrEqual(20)
    expect(
      recordFrom(transport, 'WebSocket closed').durationMs
    ).toBeGreaterThanOrEqual(40)
  })

  test('rejects a first argument that is not the route path', () => {
    const { wrapWs } = setup()

    expect(() => wrapWs({ open() {} } as never, {} as never)).toThrow(TypeError)
  })
})
