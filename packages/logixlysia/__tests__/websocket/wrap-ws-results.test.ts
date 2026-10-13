import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import type { AnyElysia } from 'elysia'
import { logixlysia } from '../../src'
import type { WsHandlerHooks } from '../../src/websocket/wrap-ws'
import { sleep } from '../_helpers/sleep'
import { waitFor } from '../_helpers/wait-for'

const REPLY_WINDOW_MS = 100

const transport = mock(
  (_level: unknown, _message: unknown, _meta?: unknown) => {
    /* noop */
  }
)
const plugin = logixlysia({
  config: {
    disableFileLogging: true,
    disableInternalLogger: true,
    showStartupMessage: false,
    transports: [{ log: transport }]
  }
})

// Bun may report an unhandled rejection through the test runner before this
// listener sees it, so the tests rely on `errors` and treat this as a second
// signal only.
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

/** Serves `hooks` through `wrapWs` and returns the socket URL of the route. */
const serve = (path: string, hooks: WsHandlerHooks): string => {
  app = new Elysia()
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

/**
 * Opens a socket, sends `message` when given and collects what the client
 * receives for a while, then closes the socket.
 */
const exchange = async (
  url: string,
  message?: string
): Promise<{ messages: unknown[]; openBeforeClose: boolean }> => {
  const socket = new WebSocket(url)
  const messages: unknown[] = []
  socket.addEventListener('message', event => {
    messages.push(event.data)
  })

  const {
    promise: opened,
    reject: onOpenFailure,
    resolve: onOpen
  }: PromiseWithResolvers<void> = Promise.withResolvers()
  socket.addEventListener('open', () => onOpen())
  // Without these, a socket that never opens leaves the test waiting here
  // instead of failing and stopping the server in `afterEach`.
  socket.addEventListener('error', () =>
    onOpenFailure(new Error('WebSocket connection failed'))
  )
  socket.addEventListener('close', () =>
    onOpenFailure(new Error('WebSocket closed before opening'))
  )
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
