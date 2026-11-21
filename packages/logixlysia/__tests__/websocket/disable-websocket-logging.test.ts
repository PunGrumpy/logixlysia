import { describe, expect, mock, test } from 'bun:test'
import { logixlysia } from '../../src'

const setup = (disableWebSocketLogging: boolean) => {
  const transport = mock((_level: unknown, _message: unknown) => {})
  const plugin = logixlysia({
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      disableWebSocketLogging,
      showStartupMessage: false,
      transports: [{ log: transport }]
    }
  })
  return { plugin, transport }
}

const messages = (transport: ReturnType<typeof setup>['transport']) =>
  transport.mock.calls.map(call => String(call[1]))

const lifecycle = (wrapWs: ReturnType<typeof setup>['plugin']['wrapWs']) => {
  const calls: string[] = []
  const hooks = wrapWs('/chat', {
    close(_ws, _code, _reason) {
      calls.push('close')
    },
    message(_ws, _message) {
      calls.push('message')
    },
    open(_ws) {
      calls.push('open')
    }
  })
  const ws = { id: 'ws-chat' }
  hooks.open?.(ws)
  hooks.message?.(ws, 'hi')
  hooks.close?.(ws, 1000, 'bye')
  return calls
}

describe('disableWebSocketLogging', () => {
  test('false logs open, message and close', () => {
    const { plugin, transport } = setup(false)

    lifecycle(plugin.wrapWs)

    expect(messages(transport)).toEqual([
      'WebSocket opened',
      'WebSocket message',
      'WebSocket closed'
    ])
  })

  test('true logs no lifecycle line and still runs every hook', () => {
    const { plugin, transport } = setup(true)

    const calls = lifecycle(plugin.wrapWs)

    expect(messages(transport)).toEqual([])
    expect(calls).toEqual(['open', 'message', 'close'])
  })
})
