import { expect, mock, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
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
  expect(transport.mock.calls[0]?.[1]).toBe(
    'WebSocket message hook failed: sync boom'
  )
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
    ['ERROR', 'WebSocket open hook failed: no room']
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
  // `code` is read while classifying a validation error. When that read
  // throws and the line is still written, this would no longer be a log
  // that failed. `why` is copied onto the record afterwards, so a throw
  // there still means nothing was logged.
  Object.defineProperty(failure, 'why', {
    get() {
      throw new Error('unreadable why')
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
  expect(transport.mock.calls[0]?.[1]).toBe(
    'WebSocket message hook failed: own error'
  )
  expect(levelsFrom(transport)).toEqual(['ERROR'])
  expect(recordAt(transport, 0).context).toEqual({
    payloadType: 'object',
    wsId: 'ws-1'
  })
  expect(recordAt(transport, 0).error).toMatchObject({ message: 'own error' })
})

test('a close hook that revokes its socket still fails with its own error', () => {
  const onError = mock((_context: unknown) => {})
  const { transport, wrapWs } = setup({ onError })
  const { proxy: raw, revoke } = Proxy.revocable({}, {})
  const failure = new Error('own')
  const hooks = wrapWs('/chat', {
    close(_ws) {
      revoke()
      throw failure
    }
  })

  let caught: unknown
  try {
    hooks.close({ id: 'ws-1', raw })
  } catch (error) {
    caught = error
  }

  expect(caught).toBe(failure)
  expect(levelsFrom(transport)).toEqual(['ERROR'])
  expect(recordAt(transport, 0).error).toMatchObject({ message: 'own' })
  expect(onError).not.toHaveBeenCalled()
})

test('a returned value is not asked for its string tag', () => {
  const { transport, wrapWs } = setup()
  let reads = 0
  const value = {}
  Object.defineProperty(value, Symbol.toStringTag, {
    configurable: true,
    get() {
      reads += 1
      return 'Generator'
    }
  })
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      return value
    }
  })

  expect(hooks.message({ id: 'ws-1' }, 'hi')).toBe(value)
  expect(reads).toBe(0)
  expect(levelsFrom(transport)).toEqual(['INFO'])
})

test('a generator from another realm is returned unchanged', () => {
  const { transport, wrapWs } = setup()
  const sync = runInNewContext('(function* () { yield "a" })()') as object
  const asyncGenerator = runInNewContext(
    '(async function* () { yield "a" })()'
  ) as object
  const hooks = wrapWs('/chat', {
    message(_ws, message) {
      return message === 'async' ? asyncGenerator : sync
    }
  })

  expect(hooks.message({ id: 'ws-1' }, 'sync')).toBe(sync)
  expect(hooks.message({ id: 'ws-2' }, 'async')).toBe(asyncGenerator)
  expect(levelsFrom(transport)).toEqual(['INFO', 'INFO'])
})

test('a validation error from a hook has its failure messages masked under autoRedact', () => {
  const { transport, wrapWs } = setup({
    autoRedact: true,
    logErrorPayload: true
  })
  const secret = 'not-a-real-password'
  // A validator that quotes the failed value in its own message, as some
  // Standard Schema validators and a schema's custom `error` text do.
  const failure = Object.assign(new Error('invalid'), {
    all: [{ message: `got "${secret}"`, path: '/password' }],
    code: 'VALIDATION',
    name: 'ValidationError',
    type: 'body',
    value: { password: secret }
  })
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      throw failure
    }
  })

  expect(() => hooks.message({ id: 'ws-1' }, 'hi')).toThrow('invalid')

  const record = recordAt(transport, 0)
  expect(record.error?.errors).toEqual([
    { message: '[REDACTED]', path: '/password' }
  ])
  expect(JSON.stringify(record.error)).not.toContain(secret)
})

test('a hook that throws undefined is still named in the message', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      const failure: unknown = undefined
      throw failure
    }
  })

  let caught: unknown
  try {
    hooks.message({ id: 'ws-1' }, 'hi')
  } catch (error) {
    caught = error
  }

  expect(caught).toBeUndefined()
  expect(transport.mock.calls[0]?.[1]).toBe(
    'WebSocket message hook failed: undefined'
  )
})

test('a socket whose id cannot be read still runs every hook', () => {
  const onError = mock((_context: unknown) => {})
  const { wrapWs } = setup({ onError })
  const socket = {
    get id(): string {
      throw new Error('no id')
    },
    raw: {}
  }
  let ran = 0
  const hooks = wrapWs('/chat', {
    close(_ws) {
      ran += 1
      return 'closed'
    },
    message(_ws, _message) {
      ran += 1
      return 'echoed'
    },
    open(_ws) {
      ran += 1
      return 'opened'
    }
  })

  expect(hooks.open(socket)).toBe('opened')
  expect(hooks.message(socket, 'hi')).toBe('echoed')
  expect(hooks.close(socket)).toBe('closed')
  expect(ran).toBe(3)
  expect(onError).toHaveBeenCalled()
})

test('disableWebSocketLogging reads nothing from the socket around a message hook', () => {
  const onError = mock((_context: unknown) => {})
  const { wrapWs } = setup({ disableWebSocketLogging: true, onError })
  const innerRaw = {}
  const reads = { id: 0, raw: 0 }
  const socket = {
    get id(): string {
      reads.id += 1
      return 'ws-1'
    },
    get raw(): object {
      reads.raw += 1
      return innerRaw
    }
  }
  let ran = 0
  const hooks = wrapWs('/chat', {
    close(_ws) {
      ran += 1
    },
    message(_ws, _message) {
      ran += 1
      return 'echoed'
    },
    open(_ws) {
      ran += 1
    }
  })

  expect(hooks.message(socket, 'hi')).toBe('echoed')
  expect(ran).toBe(1)
  expect(reads).toEqual({ id: 0, raw: 0 })
  expect(onError).not.toHaveBeenCalled()

  hooks.open(socket)
  hooks.close(socket)
  expect(reads.id).toBe(0)
})

test('a hook that returns a revoked proxy returns it and logs', () => {
  const { transport, wrapWs } = setup()
  const { proxy, revoke } = Proxy.revocable({}, {})
  revoke()
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      return proxy
    }
  })

  expect(hooks.message({ id: 'ws-1' }, 'hi')).toBe(proxy)
  expect(levelsFrom(transport)).toEqual(['INFO'])
})
