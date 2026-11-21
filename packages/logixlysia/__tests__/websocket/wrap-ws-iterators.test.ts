import { expect, mock, test } from 'bun:test'
import { createRequestContextStore } from '../../src/context/request-context'
import type { Options } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { createWsHandlerWrapper } from '../../src/websocket/wrap-ws'
import { sleep } from '../_helpers/sleep'

type TransportMock = ReturnType<
  typeof mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>
>

interface LogRecord {
  context?: Record<string, unknown>
  durationMs?: number
  error?: Record<string, unknown>
  status?: number
}

const setup = () => {
  const transport: TransportMock = mock(() => {})
  const contextStore = createRequestContextStore()
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }]
    }
  }
  const logger = createLogger(options, undefined, contextStore)
  const wrapWs = createWsHandlerWrapper(options, logger, contextStore)
  return { contextStore, transport, wrapWs }
}

const oneReply = function* oneReply(): Generator<string> {
  yield 'one'
}

const linesFrom = (transport: TransportMock): unknown[][] =>
  transport.mock.calls.map(call => [call[0], call[1]])

const recordAt = (transport: TransportMock, index: number): LogRecord =>
  (transport.mock.calls[index]?.[2] as LogRecord | undefined) ?? {}

test('a generator hook is logged after its last value, not when it returns', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    *message(_ws, _message) {
      yield 'one'
      yield 'two'
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as Iterator<unknown>
  expect(transport).not.toHaveBeenCalled()
  expect(replies.next()).toEqual({ done: false, value: 'one' })
  expect(transport).not.toHaveBeenCalled()
  expect(replies.next()).toEqual({ done: false, value: 'two' })
  expect(replies.next()).toEqual({ done: true, value: undefined })

  expect(linesFrom(transport)).toEqual([['INFO', 'WebSocket message']])
  expect(recordAt(transport, 0).status).toBe(200)
})

test('an async generator hook is logged after its last value', async () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    async *message(_ws, _message) {
      yield 'one'
      await Promise.resolve()
      yield 'two'
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as AsyncIterator<unknown>
  expect(await replies.next()).toEqual({ done: false, value: 'one' })
  expect(transport).not.toHaveBeenCalled()
  expect(await replies.next()).toEqual({ done: false, value: 'two' })
  expect(await replies.next()).toEqual({ done: true, value: undefined })

  expect(linesFrom(transport)).toEqual([['INFO', 'WebSocket message']])
})

test('a generator that throws mid-stream writes one ERROR line', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    *message(_ws, _message) {
      yield 'one'
      throw new Error('boom mid-stream')
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as Iterator<unknown>
  expect(replies.next()).toEqual({ done: false, value: 'one' })
  expect(() => replies.next()).toThrow('boom mid-stream')

  expect(linesFrom(transport)).toEqual([['ERROR', 'WebSocket message']])
  expect(recordAt(transport, 0).error).toMatchObject({
    message: 'boom mid-stream'
  })
  expect(recordAt(transport, 0)).not.toHaveProperty('status')
})

test('an async generator that throws mid-stream writes one ERROR line', async () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    async *message(_ws, _message) {
      yield 'one'
      await Promise.resolve()
      throw new Error('boom mid-stream')
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as AsyncIterator<unknown>
  await replies.next()
  await expect(replies.next()).rejects.toThrow('boom mid-stream')

  expect(linesFrom(transport)).toEqual([['ERROR', 'WebSocket message']])
  expect(recordAt(transport, 0).error).toMatchObject({
    message: 'boom mid-stream'
  })
})

test('a consumer that stops a generator early still gets exactly one line', async () => {
  const { transport, wrapWs } = setup()
  let cleanedUp = false
  const hooks = wrapWs('/chat', {
    async *message(_ws, _message) {
      try {
        yield 'one'
        yield 'two'
      } finally {
        cleanedUp = true
      }
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as AsyncIterator<unknown>
  await replies.next()
  await replies.return?.()
  await replies.return?.()

  expect(cleanedUp).toBe(true)
  expect(linesFrom(transport)).toEqual([['INFO', 'WebSocket message']])
})

test('a generator that only returns a value still hands that value on', () => {
  const { wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    // oxlint-disable-next-line require-yield -- the hook replies with its return value
    *message(_ws, _message) {
      return 'only'
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as Iterator<unknown>

  expect(replies.next()).toEqual({ done: true, value: 'only' })
})

test('an async hook that resolves to a generator is logged after the generator finishes', async () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    async message(_ws, _message) {
      await Promise.resolve()
      return oneReply()
    }
  })

  const replies = (await hooks.message(
    { id: 'ws-1' },
    'hi'
  )) as Iterator<unknown>
  expect(transport).not.toHaveBeenCalled()
  expect([...{ [Symbol.iterator]: () => replies }]).toEqual(['one'])

  expect(linesFrom(transport)).toEqual([['INFO', 'WebSocket message']])
})

test('a generator that outlives the close keeps its line timed from the open and its context', async () => {
  const { contextStore, transport, wrapWs } = setup()
  const raw = {}
  const hooks = wrapWs('/chat', {
    close(_ws) {},
    async *message(_ws, _message) {
      yield 'one'
      await sleep(30)
      yield 'two'
    },
    open(_ws) {}
  })

  hooks.open({ id: 'ws-1', raw })
  contextStore.mergeContext(raw, { room: 'lobby' })
  const replies = hooks.message(
    { id: 'ws-1', raw },
    'hi'
  ) as AsyncIterator<unknown>
  expect(await replies.next()).toEqual({ done: false, value: 'one' })
  hooks.close({ id: 'ws-1', raw })
  expect(
    await Array.fromAsync({ [Symbol.asyncIterator]: () => replies })
  ).toEqual(['two'])

  expect(linesFrom(transport)).toEqual([
    ['INFO', 'WebSocket opened'],
    ['INFO', 'WebSocket closed'],
    ['INFO', 'WebSocket message']
  ])
  const message = transport.mock.calls[2]?.[2] as LogRecord | undefined
  expect(message?.durationMs).toBeGreaterThanOrEqual(25)
  expect(message?.context).toEqual({
    payloadType: 'string',
    room: 'lobby',
    wsId: 'ws-1'
  })
  expect(contextStore.getContext(raw)).toEqual({})
})
