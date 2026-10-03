import { expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { sleep } from '../_helpers/sleep'

const POLL_INTERVAL_MS = 10
const POLL_TIMEOUT_MS = 1000
const IDLE_MS = 30

interface LogRecord {
  context?: Record<string, unknown>
  durationMs?: number
}

/** Resolves once the predicate holds, or after the timeout. */
const waitFor = (predicate: () => boolean): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  const deadline = Date.now() + POLL_TIMEOUT_MS
  const timer = setInterval(() => {
    if (predicate() || Date.now() >= deadline) {
      clearInterval(timer)
      resolve()
    }
  }, POLL_INTERVAL_MS)
  return promise
}

test('logs the connection duration and merged context on a real socket', async () => {
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
  const app = new Elysia()
    .use(plugin)
    .ws('/chat', {
      ...plugin.wrapWs('/chat', {
        open(ws) {
          ws.data?.store?.logger?.mergeContext(ws, { room: 'lobby' })
        }
      })
    })
    .listen(0)

  try {
    const port = app.server?.port
    if (port === undefined) {
      throw new Error('server did not start')
    }

    const socket = new WebSocket(`ws://localhost:${port}/chat`)
    const { promise: opened, resolve: onOpen }: PromiseWithResolvers<void> =
      Promise.withResolvers()
    socket.addEventListener('open', () => onOpen())
    await opened

    await sleep(IDLE_MS)
    socket.send('hi')
    await sleep(IDLE_MS)
    socket.close()

    const findClosed = () =>
      transport.mock.calls.find(call => call[1] === 'WebSocket closed')
    await waitFor(() => findClosed() !== undefined)

    const closed = findClosed()
    if (!closed) {
      throw new Error('no "WebSocket closed" record within 1s')
    }
    const record = closed[2] as LogRecord
    expect(record.durationMs).toBeGreaterThanOrEqual(50)
    expect(record.context?.room).toBe('lobby')
  } finally {
    await app.stop()
  }
})
