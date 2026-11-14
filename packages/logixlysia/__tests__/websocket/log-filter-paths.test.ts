import { describe, expect, mock, test } from 'bun:test'
import { logixlysia } from '../../src'
import { createRequestContextStore } from '../../src/context/request-context'
import type { Options } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { createWsHandlerWrapper } from '../../src/websocket/wrap-ws'

type Config = NonNullable<Options['config']>

const setup = (logFilter: Config['logFilter']) => {
  const transport = mock((_level: unknown, _message: unknown) => {})
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      logFilter,
      transports: [{ log: transport }]
    }
  }
  const contextStore = createRequestContextStore()
  const logger = createLogger(options, undefined, contextStore)
  const wrapWs = createWsHandlerWrapper(options, logger, contextStore)
  return { transport, wrapWs }
}

const messages = (transport: ReturnType<typeof setup>['transport']) =>
  transport.mock.calls.map(call => String(call[1]))

const lifecycle = (
  wrapWs: ReturnType<typeof setup>['wrapWs'],
  path: string
) => {
  const hooks = wrapWs(path, {
    close(_ws, _code, _reason) {},
    message(_ws, _message) {},
    open(_ws) {}
  })
  const ws = { id: `ws-${path}` }
  hooks.open?.(ws)
  hooks.message?.(ws, 'hi')
  hooks.close?.(ws, 1000, 'bye')
}

describe('logFilter paths on WebSocket lines', () => {
  test('exclude silences open, message and close for that path', () => {
    const { transport, wrapWs } = setup({ exclude: ['/ws/**'] })

    lifecycle(wrapWs, '/ws/chat')
    expect(messages(transport)).toEqual([])

    lifecycle(wrapWs, '/chat')
    expect(messages(transport)).toEqual([
      'WebSocket opened',
      'WebSocket message',
      'WebSocket closed'
    ])
  })

  test('include logs only the matching socket paths', () => {
    const { transport, wrapWs } = setup({ include: ['/chat'] })

    lifecycle(wrapWs, '/feed')
    expect(messages(transport)).toEqual([])

    lifecycle(wrapWs, '/chat')
    expect(messages(transport)).toHaveLength(3)
  })

  test('exclude beats include', () => {
    const { transport, wrapWs } = setup({
      exclude: ['/chat'],
      include: ['/**']
    })

    lifecycle(wrapWs, '/chat')

    expect(messages(transport)).toEqual([])
  })
})

test('the plugin applies the filter to the sockets it wraps', () => {
  const transport = mock((_level: unknown, _message: unknown) => {})
  const plugin = logixlysia({
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      logFilter: { exclude: ['/ws/**'] },
      showStartupMessage: false,
      transports: [{ log: transport }]
    }
  })

  lifecycle(plugin.wrapWs, '/ws/chat')
  lifecycle(plugin.wrapWs, '/chat')

  expect(messages(transport)).toEqual([
    'WebSocket opened',
    'WebSocket message',
    'WebSocket closed'
  ])
})
