import { expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { websocket } from 'elysia/websocket'
import { logixlysia } from '../../src'
import { awaitOpen } from '../_helpers/await-open'
import { sleep } from '../_helpers/sleep'
import { waitFor } from '../_helpers/wait-for'

const IDLE_MS = 30

interface LogRecord {
  context?: Record<string, unknown>
  durationMs?: number
}

test('logs the connection duration and merged context on a real socket', async () => {
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
  const app = new Elysia()
    .use(websocket())
    .use(plugin)
    .ws('/chat', {
      ...plugin.wrapWs('/chat', {
        open(ws) {
          ws.store?.logger?.mergeContext(ws, { room: 'lobby' })
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
    const opened = awaitOpen(socket)
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
