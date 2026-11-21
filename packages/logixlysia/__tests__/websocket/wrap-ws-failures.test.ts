import { expect, mock, test } from 'bun:test'
import { createRequestContextStore } from '../../src/context/request-context'
import type { Options } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { createWsHandlerWrapper } from '../../src/websocket/wrap-ws'

type TransportMock = ReturnType<
  typeof mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>
>

interface LogRecord {
  context?: Record<string, unknown>
  error?: Record<string, unknown>
}

const setup = (config: NonNullable<Options['config']> = {}) => {
  const transport: TransportMock = mock(() => {})
  const contextStore = createRequestContextStore()
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }],
      ...config
    }
  }
  const logger = createLogger(options, undefined, contextStore)
  const wrapWs = createWsHandlerWrapper(options, logger, contextStore)
  return { contextStore, transport, wrapWs }
}

const levelsFrom = (transport: TransportMock): unknown[] =>
  transport.mock.calls.map(call => call[0])

const recordAt = (transport: TransportMock, index: number): LogRecord =>
  (transport.mock.calls[index]?.[2] as LogRecord | undefined) ?? {}

test('a message hook that throws writes one ERROR line carrying the error', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      throw new Error('sync boom')
    }
  })

  expect(() => hooks.message({ id: 'ws-1' }, 'hi')).toThrow('sync boom')

  expect(levelsFrom(transport)).toEqual(['ERROR'])
  expect(transport.mock.calls[0]?.[1]).toBe('WebSocket message')
  const record = recordAt(transport, 0)
  expect(record.error).toMatchObject({ message: 'sync boom', name: 'Error' })
  expect(record.context).toEqual({ payloadType: 'string', wsId: 'ws-1' })
  expect(record).not.toHaveProperty('status')
})

test('a message hook that rejects writes one ERROR line carrying the error', async () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    async message(_ws, _message) {
      await Promise.resolve()
      throw new Error('async boom')
    }
  })

  await expect(hooks.message({ id: 'ws-1' }, 'hi')).rejects.toThrow(
    'async boom'
  )

  expect(levelsFrom(transport)).toEqual(['ERROR'])
  expect(recordAt(transport, 0).error).toMatchObject({
    message: 'async boom'
  })
  expect(recordAt(transport, 0)).not.toHaveProperty('status')
})

test('an open hook that throws writes an ERROR opened line', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    open(_ws) {
      throw new Error('no room')
    }
  })

  expect(() => hooks.open({ id: 'ws-1' })).toThrow('no room')

  expect(transport.mock.calls.map(call => [call[0], call[1]])).toEqual([
    ['ERROR', 'WebSocket opened']
  ])
  expect(recordAt(transport, 0).error).toMatchObject({ message: 'no room' })
})

test('a close hook that rejects writes an ERROR closed line and still clears the context', async () => {
  const { contextStore, transport, wrapWs } = setup()
  const ws = { id: 'ws-1' }
  const hooks = wrapWs('/chat', {
    async close(_ws, _code, _reason) {
      await Promise.resolve()
      throw new Error('cleanup failed')
    }
  })
  contextStore.mergeContext(ws, { room: 'lobby' })

  await expect(hooks.close(ws, 1001, 'going away')).rejects.toThrow(
    'cleanup failed'
  )

  expect(levelsFrom(transport)).toEqual(['ERROR'])
  expect(recordAt(transport, 0).context).toEqual({
    code: 1001,
    reason: 'going away',
    room: 'lobby',
    wsId: 'ws-1'
  })
  expect(recordAt(transport, 0).error).toMatchObject({
    message: 'cleanup failed'
  })
  expect(contextStore.getContext(ws)).toEqual({})
})

test('a successful hook keeps its INFO line with status 200', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      return 'ok'
    }
  })

  expect(hooks.message({ id: 'ws-1' }, 'hi')).toBe('ok')

  expect(levelsFrom(transport)).toEqual(['INFO'])
  expect(recordAt(transport, 0)).toMatchObject({ status: 200 })
  expect(recordAt(transport, 0)).not.toHaveProperty('error')
})

test('disableWebSocketLogging also silences a failed hook', () => {
  const { transport, wrapWs } = setup({ disableWebSocketLogging: true })
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      throw new Error('quiet')
    }
  })

  expect(() => hooks.message({ id: 'ws-1' }, 'hi')).toThrow('quiet')

  expect(transport).not.toHaveBeenCalled()
})

test('the hook error still reaches the caller when it cannot be logged', () => {
  const onError = mock((_context: unknown) => {})
  const { transport, wrapWs } = setup({ onError })
  const failure = new Error('original')
  Object.defineProperty(failure, 'code', {
    get() {
      throw new Error('unreadable code')
    }
  })
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      throw failure
    }
  })

  let caught: unknown
  try {
    hooks.message({ id: 'ws-1' }, 'hi')
  } catch (error) {
    caught = error
  }

  expect(caught).toBe(failure)
  expect(transport).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError.mock.calls[0]?.[0]).toMatchObject({ sink: 'format' })
})

test('a hook that revokes the message it was given still fails with its own error', () => {
  const { transport, wrapWs } = setup()
  const { proxy, revoke } = Proxy.revocable({}, {})
  const failure = new Error('own error')
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      revoke()
      throw failure
    }
  })

  let caught: unknown
  try {
    hooks.message({ id: 'ws-1' }, proxy)
  } catch (error) {
    caught = error
  }

  expect(caught).toBe(failure)
  expect(levelsFrom(transport)).toEqual(['ERROR'])
  expect(recordAt(transport, 0).context).toEqual({
    payloadType: 'object',
    wsId: 'ws-1'
  })
  expect(recordAt(transport, 0).error).toMatchObject({ message: 'own error' })
})
