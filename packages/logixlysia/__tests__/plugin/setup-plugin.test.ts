import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { Options } from '../../src/interfaces'
import { awaitOpen } from '../_helpers/await-open'
import { websocketCapability, wsContext } from '../_helpers/elysia'
import { sleep } from '../_helpers/sleep'
import { waitFor } from '../_helpers/wait-for'

const createCaptureTransport = () => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {}
  )
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      showStartupMessage: false,
      transports: [{ log: transport }]
    }
  }
  const urls = (): unknown[] =>
    transport.mock.calls.map(
      call => (call[2] as { request?: { url: string } }).request?.url
    )
  const messages = (): unknown[] => transport.mock.calls.map(call => call[1])
  return { messages, options, transport, urls }
}

describe('logixlysia plugin - installed through a setup plugin', () => {
  test('a route on the app that uses the setup plugin gets log', async () => {
    const capture = createCaptureTransport()
    const setup = new Elysia({ name: 'setup' }).use(logixlysia(capture.options))
    const app = new Elysia().use(setup).get('/', ({ log }) => {
      log.info('from the handler')
      return 'ok'
    })

    const response = await app.handle(new Request('http://localhost/'))
    await sleep(30)

    expect(response.status).toBe(200)
    expect(capture.messages()).toContain('from the handler')
  })

  test('a route two levels above the setup plugin gets log', async () => {
    const capture = createCaptureTransport()
    const setup = new Elysia({ name: 'setup' }).use(logixlysia(capture.options))
    const feature = new Elysia({ name: 'feature' }).use(setup)
    const app = new Elysia().use(feature).get('/', ({ log }) => {
      log.info('from the handler')
      return 'ok'
    })

    const response = await app.handle(new Request('http://localhost/'))
    await sleep(30)

    expect(response.status).toBe(200)
    expect(capture.messages()).toContain('from the handler')
  })

  test('group and guard routes above the setup plugin get log', async () => {
    const capture = createCaptureTransport()
    const setup = new Elysia({ name: 'setup' }).use(logixlysia(capture.options))
    const app = new Elysia()
      .use(setup)
      .group('/g', group =>
        group.get('/', ({ log }) => {
          log.info('from the group')
          return 'ok'
        })
      )
      .guard({}, guard =>
        guard.get('/guarded', ({ log }) => {
          log.info('from the guard')
          return 'ok'
        })
      )

    const grouped = await app.handle(new Request('http://localhost/g/'))
    const guarded = await app.handle(new Request('http://localhost/guarded'))
    await sleep(30)

    expect([grouped.status, guarded.status]).toEqual([200, 200])
    expect(capture.messages()).toContain('from the group')
    expect(capture.messages()).toContain('from the guard')
  })

  test('an onError handler above the setup plugin gets log', async () => {
    const capture = createCaptureTransport()
    const setup = new Elysia({ name: 'setup' }).use(logixlysia(capture.options))
    const app = new Elysia()
      .use(setup)
      .onError(({ log }) => {
        log?.warn('from onError')
        return 'handled'
      })
      .get('/', () => {
        throw new Error('boom')
      })

    await app.handle(new Request('http://localhost/'))
    await sleep(30)

    expect(capture.messages()).toContain('from onError')
  })

  test('a WebSocket route above the setup plugin gets log', async () => {
    const capture = createCaptureTransport()
    const setup = new Elysia({ name: 'setup' }).use(logixlysia(capture.options))
    const app = new Elysia()
      .use(websocketCapability())
      .use(setup)
      .ws('/ws', {
        open(ws) {
          wsContext(ws).log.info('from the socket')
        }
      })
      .listen(0)

    try {
      const socket = new WebSocket(`ws://localhost:${app.server?.port}/ws`)
      await awaitOpen(socket)
      await waitFor(() => capture.messages().includes('from the socket'))
      socket.close()

      expect(capture.messages()).toContain('from the socket')
    } finally {
      await app.stop(true)
    }
  })

  test('a request through the app and the setup plugin is logged once', async () => {
    const capture = createCaptureTransport()
    const setup = new Elysia({ name: 'setup' })
      .use(logixlysia(capture.options))
      .get('/inner', () => 'inner')
    const app = new Elysia().use(setup).get('/outer', () => 'outer')

    await app.handle(new Request('http://localhost/inner'))
    await app.handle(new Request('http://localhost/outer'))
    await sleep(30)

    expect(capture.urls()).toEqual([
      'http://localhost/inner',
      'http://localhost/outer'
    ])
  })
})
