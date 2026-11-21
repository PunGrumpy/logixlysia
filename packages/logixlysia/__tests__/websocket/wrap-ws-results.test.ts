import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import type { AnyElysia } from 'elysia'
import { logixlysia } from '../../src'
import type { WsHandlerHooks } from '../../src/websocket/wrap-ws'
import { awaitOpen } from '../_helpers/await-open'
import { isElysia2, websocketCapability } from '../_helpers/elysia'
import { sleep } from '../_helpers/sleep'
import { waitFor } from '../_helpers/wait-for'

const REPLY_WINDOW_MS = 100

const transport = mock(
  (_level: unknown, _message: unknown, _meta?: unknown) => {}
)
const plugin = logixlysia({
  config: {
    disableFileLogging: true,
    disableInternalLogger: true,
    showStartupMessage: false,
    transports: [{ log: transport }]
  }
})

let rejections = 0
const onRejection = (): void => {
  rejections += 1
}
process.on('unhandledRejection', onRejection)

const errors: unknown[] = []
let app: AnyElysia | undefined

beforeEach(() => {
  transport.mockReset()
  errors.length = 0
  rejections = 0
})

afterEach(async () => {
  // The client's close event can fire before the server has handled the
  // close, and on Bun 1.3 a graceful stop() begun in that gap never resolves.
  // stop(true) closes such a socket and writes its close line before it
  // resolves, so the line stays out of the next test's records.
  await app?.stop(true)
  app = undefined
})

afterAll(() => {
  process.off('unhandledRejection', onRejection)
})

const serve = (path: string, hooks: WsHandlerHooks): string => {
  app = new Elysia()
    .use(websocketCapability())
    .use(plugin)
    .onError(({ error }) => {
      errors.push(error)
    })
    .ws(path, { ...plugin.wrapWs(path, hooks) })
    .listen(0)

  const port = app.server?.port
  if (port === undefined) {
    throw new Error('server did not start')
  }
  return `ws://localhost:${port}${path}`
}

const exchange = async (
  url: string,
  message?: string
): Promise<{ messages: unknown[]; openBeforeClose: boolean }> => {
  const socket = new WebSocket(url)
  const messages: unknown[] = []
  socket.addEventListener('message', event => {
    messages.push(event.data)
  })

  const opened = awaitOpen(socket)
  await opened

  if (message !== undefined) {
    socket.send(message)
  }
  await sleep(REPLY_WINDOW_MS)

  const openBeforeClose = socket.readyState === WebSocket.OPEN
  socket.close()
  return { messages, openBeforeClose }
}

const recordsNamed = (name: string) =>
  transport.mock.calls.filter(call => call[1] === name)

test('a wrapped hook that returns a string replies', async () => {
  const url = serve('/echo', {
    message(_ws, m) {
      return `echo:${m}`
    }
  })

  const { messages } = await exchange(url, 'hi')

  expect(messages).toEqual(['echo:hi'])
})

test('a wrapped async hook replies after it resolves', async () => {
  const url = serve('/late', {
    async message(_ws, m) {
      await sleep(10)
      return `late:${m}`
    }
  })

  const { messages } = await exchange(url, 'hi')

  expect(messages).toEqual(['late:hi'])
})

test('a wrapped generator hook sends every value', async () => {
  const url = serve('/stream', {
    *message(_ws, m) {
      yield `${m}-1`
      yield `${m}-2`
    }
  })

  const { messages } = await exchange(url, 'hi')

  expect(messages).toEqual(['hi-1', 'hi-2'])
})

test('a wrapped async hook that rejects reaches Elysia instead of becoming an unhandled rejection', async () => {
  const url = serve('/reject', {
    async message() {
      await sleep(1)
      throw new Error('boom')
    }
  })

  const { openBeforeClose } = await exchange(url, 'hi')

  expect(errors).toHaveLength(1)
  expect(errors[0]).toBeInstanceOf(Error)
  expect(errors[0]).toHaveProperty('message', 'boom')
  expect(rejections).toBe(0)
  expect(openBeforeClose).toBe(true)
})

test('the message line is written after an async hook settles', async () => {
  let finished = false
  const finishedWhenLogged: boolean[] = []
  transport.mockImplementation((_level, message) => {
    if (message === 'WebSocket message') {
      finishedWhenLogged.push(finished)
    }
  })
  const url = serve('/settle', {
    async message() {
      await sleep(10)
      finished = true
    }
  })

  await exchange(url, 'hi')

  expect(finishedWhenLogged).toEqual([true])
})

test('a synchronous throw still reaches Elysia and is still logged', async () => {
  const url = serve('/throw', {
    message() {
      throw new Error('sync')
    }
  })

  await exchange(url, 'hi')

  expect(errors).toHaveLength(1)
  expect(errors[0]).toBeInstanceOf(Error)
  expect(errors[0]).toHaveProperty('message', 'sync')
  expect(recordsNamed('WebSocket message')).toHaveLength(1)
  expect(rejections).toBe(0)
})

test('a wrapped open hook that returns a value replies', async () => {
  const url = serve('/welcome', {
    open() {
      return 'welcome'
    }
  })

  const { messages } = await exchange(url)

  expect(messages).toEqual(['welcome'])
})

test('an async close hook still sees the request context', async () => {
  const url = serve('/farewell', {
    async close(ws) {
      await sleep(5)
      plugin.store.logger.mergeContext(ws, { farewell: true })
    }
  })

  await exchange(url)
  await waitFor(() => recordsNamed('WebSocket closed').length > 0)

  const [closed] = recordsNamed('WebSocket closed')
  expect(closed?.[2]).toMatchObject({ context: { farewell: true } })
})

test('a hook that rejects on a real socket writes one ERROR line with the error', async () => {
  const url = serve('/reject-logged', {
    async message() {
      await sleep(1)
      throw new Error('boom')
    }
  })

  await exchange(url, 'hi')
  await waitFor(() => recordsNamed('WebSocket message').length > 0)

  const lines = recordsNamed('WebSocket message')
  expect(lines.map(call => call[0])).toEqual(['ERROR'])
  expect(lines[0]?.[2]).toMatchObject({ error: { message: 'boom' } })
  expect(lines[0]?.[2]).not.toHaveProperty('status')
  expect(errors).toHaveLength(1)
})

const connect = async (
  url: string
): Promise<{ frames: unknown[]; socket: WebSocket }> => {
  const socket = new WebSocket(url)
  const frames: unknown[] = []
  socket.addEventListener('message', event => {
    frames.push(event.data)
  })
  await awaitOpen(socket)
  return { frames, socket }
}

test('a generator hook that fails mid-stream sends what it yielded and writes one ERROR line', async () => {
  const url = serve('/stream-fail', {
    async *message(_ws, m) {
      yield `${m}-1`
      await sleep(10)
      throw new Error('boom mid-stream')
    }
  })

  const { frames, socket } = await connect(url)
  socket.send('hi')
  await waitFor(
    () =>
      frames.length > 0 &&
      errors.length > 0 &&
      recordsNamed('WebSocket message').length > 0
  )
  socket.close()

  expect(frames).toEqual(['hi-1'])
  expect(errors).toHaveLength(1)
  expect(errors[0]).toHaveProperty('message', 'boom mid-stream')
  const lines = recordsNamed('WebSocket message')
  expect(lines.map(call => call[0])).toEqual(['ERROR'])
  expect(lines[0]?.[2]).toMatchObject({
    error: { message: 'boom mid-stream' }
  })
})

// Sends what a hook returned on a route without and a route with `wrapWs`,
// collecting each socket's frames up to the last one the hook sends.
const framesWithAndWithout = async (
  reply: () => unknown
): Promise<{ unwrapped: unknown[]; wrapped: unknown[] }> => {
  const hooks: WsHandlerHooks = { message: () => reply() }
  app = new Elysia()
    .use(websocketCapability())
    .use(plugin)
    .ws('/plain', { ...hooks })
    .ws('/wrapped', { ...plugin.wrapWs('/wrapped', hooks) })
    .listen(0)
  const port = app.server?.port
  if (port === undefined) {
    throw new Error('server did not start')
  }

  const collect = async (path: string): Promise<unknown[]> => {
    const { frames, socket } = await connect(`ws://localhost:${port}${path}`)
    socket.send('go')
    await waitFor(() => frames.includes('end'))
    socket.close()
    return frames
  }

  return {
    unwrapped: await collect('/plain'),
    wrapped: await collect('/wrapped')
  }
}

test('a hand-written iterator sends the same frames with and without wrapWs', async () => {
  const { unwrapped, wrapped } = await framesWithAndWithout(() => {
    const fromNext = ['a', 'end'][Symbol.iterator]()
    return {
      next: () => fromNext.next(),
      [Symbol.iterator]: () => ['b', 'end'][Symbol.iterator]()
    }
  })

  // Elysia 1 pulls the first value with `next()` and the rest with `for…of`;
  // Elysia 2 pulls every value with `next()`.
  expect(unwrapped).toEqual(isElysia2 ? ['a', 'end'] : ['a', 'b', 'end'])
  expect(wrapped).toEqual(unwrapped)
})

test('a hand-written async iterator that yields a promise sends the same frames with and without wrapWs', async () => {
  const { unwrapped, wrapped } = await framesWithAndWithout(() => {
    const values: unknown[] = [Promise.resolve('p'), 'end']
    let index = 0
    const replies = {
      next: (): Promise<IteratorResult<unknown>> => {
        if (index >= values.length) {
          return Promise.resolve({ done: true, value: undefined })
        }
        index += 1
        return Promise.resolve({ done: false, value: values[index - 1] })
      },
      [Symbol.asyncIterator]: () => replies
    }
    return replies
  })

  expect(unwrapped).toEqual(['{}', 'end'])
  expect(wrapped).toEqual(unwrapped)
})

test('a generator sends the same frames with and without wrapWs', async () => {
  const { unwrapped, wrapped } = await framesWithAndWithout(function* reply() {
    yield 'a'
    yield 'end'
  })

  expect(unwrapped).toEqual(['a', 'end'])
  expect(wrapped).toEqual(unwrapped)
})

test('an async generator sends the same frames with and without wrapWs', async () => {
  const { unwrapped, wrapped } = await framesWithAndWithout(
    async function* reply() {
      yield 'a'
      await sleep(1)
      yield 'end'
    }
  )

  expect(unwrapped).toEqual(['a', 'end'])
  expect(wrapped).toEqual(unwrapped)
})
