import { describe, expect, mock, test } from 'bun:test'
import { Elysia, sse, status } from 'elysia'
import { logixlysia, useLogger } from '../../src'
import type { Options } from '../../src/interfaces'
import { sleep } from '../_helpers/sleep'

interface CapturedMeta {
  context?: Record<string, unknown>
  durationMs: number
  error?: { message?: string }
  request?: { url: string }
  status?: number
}

const createCaptureTransport = (config: Options['config'] = {}) => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {
      /* noop */
    }
  )
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }],
      ...config
    }
  }
  return { options, transport }
}

const recordAt = (
  transport: ReturnType<typeof createCaptureTransport>['transport'],
  index: number
): { level: unknown; meta: CapturedMeta } => {
  const call = transport.mock.calls[index]
  if (!call) {
    throw new Error(`no transport call recorded at index ${index}`)
  }
  return { level: call[0], meta: call[2] as CapturedMeta }
}

interface Handles {
  handle: (request: Request) => Promise<Response>
}

const run = async (
  app: Handles,
  path: string
): Promise<{ body: string; response: Response }> => {
  const response = await app.handle(new Request(`http://localhost${path}`))
  let body = ''
  try {
    body = await response.text()
  } catch {
    // A body that fails mid-stream still has headers to assert on.
  }
  await sleep(30)
  return { body, response }
}

// Elysia's own test for whether a hook makes the compiled handler async.
const ELYSIA_IS_ASYNC = /(?:return|=>)\s?\S+\(|a(?:sync|wait)/u

const slowStream = async function* slowStream() {
  yield 'a'
  await sleep(40)
  yield 'b'
}

const failCleanup = (): never => {
  throw new Error('cleanup failed')
}

describe('logixlysia plugin - final line', () => {
  test('logs the status a handler set before throwing a plain Error', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia().use(logixlysia(options)).get('/x', ({ set }) => {
      set.status = 404
      throw new Error('nope')
    })

    const { response } = await run(app, '/x')

    expect(response.status).toBe(404)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(404)
    expect(transport.mock.calls[0]?.[1]).toBe('nope')
  })

  test('keeps 500 for a thrown Error when set.status was not set', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia().use(logixlysia(options)).get('/x', () => {
      throw new Error('nope')
    })

    const { response } = await run(app, '/x')

    expect(response.status).toBe(500)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('ERROR')
    expect(meta.status).toBe(500)
  })

  test('a thrown status() wins over set.status', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia().use(logixlysia(options)).get('/x', ({ set }) => {
      set.status = 404
      throw status(409, 'conflict')
    })

    const { response } = await run(app, '/x')

    expect(response.status).toBe(409)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(409)
    expect(transport.mock.calls[0]?.[1]).toBe('conflict')
  })

  test('logs the status an onError registered after the plugin answers with', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .onError(() => status(404, 'gone'))
      .get('/x', () => {
        throw new Error('m')
      })

    const { response } = await run(app, '/x')

    expect(response.status).toBe(404)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(404)
    expect(transport.mock.calls[0]?.[1]).toBe('m')
  })

  test('logs the status an app-wide onError registered before the plugin answers with', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .onError({ as: 'global' }, () => status(404, 'gone'))
      .use(logixlysia(options))
      .get('/x', () => {
        throw new Error('m')
      })

    const { response } = await run(app, '/x')

    expect(response.status).toBe(404)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(404)
  })

  test('logs the status a mapResponse hook sends', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .mapResponse(() => new Response('teapot', { status: 418 }))
      .get('/map', () => 'ok')

    const { response } = await run(app, '/map')

    expect(response.status).toBe(418)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(418)
  })

  test('logs a response returned from an onRequest hook registered after the plugin', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .onRequest(({ set }) => {
        set.status = 429
        return 'busy'
      })
      .get('/', () => 'ok')

    const { response } = await run(app, '/')

    expect(response.status).toBe(429)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(429)
  })

  test('does not mistake an object body for a status() result', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/envelope', () => ({ code: 0, response: { ok: true } }))
      .get('/business-error', () => ({ code: 40_001, response: null }))

    await run(app, '/envelope')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).level).toBe('INFO')
    expect(recordAt(transport, 0).meta.status).toBe(200)

    await run(app, '/business-error')

    expect(transport).toHaveBeenCalledTimes(2)
    expect(recordAt(transport, 1).level).toBe('INFO')
    expect(recordAt(transport, 1).meta.status).toBe(200)
  })

  test('does not mistake an object body for a status() result on the hook path too', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia({ aot: false })
      .use(logixlysia(options))
      .get('/envelope', () => ({ code: 0, response: { ok: true } }))
      .get('/business-error', () => ({ code: 40_001, response: null }))

    await run(app, '/envelope')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).level).toBe('INFO')
    expect(recordAt(transport, 0).meta.status).toBe(200)

    await run(app, '/business-error')

    expect(transport).toHaveBeenCalledTimes(2)
    expect(recordAt(transport, 1).level).toBe('INFO')
    expect(recordAt(transport, 1).meta.status).toBe(200)
  })

  test('logs a thrown 3xx status() at INFO', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia().use(logixlysia(options)).get('/x', () => {
      throw status(302, 'moved')
    })

    const { response } = await run(app, '/x')

    expect(response.status).toBe(302)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(302)
  })

  test('times a streamed response until its body ends', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia().use(logixlysia(options)).get('/s', slowStream)

    const { body } = await run(app, '/s')

    expect(body).toBe('ab')
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(200)
    expect(meta.durationMs).toBeGreaterThanOrEqual(35)
  })

  test('logs an error line when a streamed body throws', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/s', async function* failingStream() {
        yield 'a'
        await sleep(5)
        throw new Error('mid')
      })

    await run(app, '/s')

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('ERROR')
    expect(meta.status).toBe(200)
    expect(transport.mock.calls[0]?.[1]).toBe('mid')
    expect(meta.error?.message).toBe('mid')
  })

  test('logs an error line when a sync generator body throws', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/s', function* failingSyncStream() {
        yield 'a'
        throw new Error('sync mid')
      })

    await run(app, '/s')

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('ERROR')
    expect(meta.status).toBe(200)
    expect(transport.mock.calls[0]?.[1]).toBe('sync mid')
    expect(meta.error?.message).toBe('sync mid')
  })

  test('times a sync generator until it finishes', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/s', function* spinStream() {
        yield 'a'
        const until = performance.now() + 20
        while (performance.now() < until) {
          // A sync generator cannot sleep, so it spins.
        }
        yield 'b'
      })

    await run(app, '/s')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).meta.durationMs).toBeGreaterThanOrEqual(15)
  })

  test('rescues a slow stream through tail sampling', async () => {
    const { options, transport } = createCaptureTransport({
      sampling: { head: { INFO: 0 }, tail: { durationMs: 30 } }
    })
    const app = new Elysia().use(logixlysia(options)).get('/s', slowStream)

    await run(app, '/s')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).meta.status).toBe(200)
  })

  test('keeps the event-stream framing of a generator wrapped in sse()', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/events', () => sse(slowStream()))

    const { body, response } = await run(app, '/events')

    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(body).toBe('data: a\n\ndata: b\n\n')
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(200)
    expect(meta.durationMs).toBeGreaterThanOrEqual(35)
  })

  test('logs the status a mapResponse hook sends in place of a generator', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .mapResponse(() => new Response('replaced', { status: 203 }))
      .get('/s', slowStream)

    const { body, response } = await run(app, '/s')

    expect(response.status).toBe(203)
    expect(body).toBe('replaced')
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(203)
  })

  test('a user onAfterHandle registered after the plugin can log through useLogger()', async () => {
    const { options, transport } = createCaptureTransport({
      useAsyncLocalStorage: true
    })
    const app = new Elysia()
      .use(logixlysia(options))
      .onAfterHandle(() => {
        useLogger().info('from hook')
      })
      .get('/x', () => 'ok')

    await run(app, '/x')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[1]).toBe('from hook')
  })

  test('a generator body can log through useLogger() after a yield', async () => {
    const { options, transport } = createCaptureTransport({
      useAsyncLocalStorage: true
    })
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/s', async function* loggingStream() {
        yield 'a'
        await sleep(5)
        // oxlint-disable-next-line react-hooks/rules-of-hooks -- useLogger() is not a React hook
        useLogger().info('from stream')
        yield 'b'
      })

    await run(app, '/s')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[1]).toBe('from stream')
  })

  test('a sync generator body can log through useLogger() after a yield', async () => {
    const { options, transport } = createCaptureTransport({
      useAsyncLocalStorage: true
    })
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/s', function* syncLoggingStream() {
        yield 'a'
        // oxlint-disable-next-line react-hooks/rules-of-hooks -- useLogger() is not a React hook
        useLogger().info('from sync stream')
        yield 'b'
      })

    await run(app, '/s')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[1]).toBe('from sync stream')
  })

  test('a handler that awaits app.handle() for another route keeps its own logger', async () => {
    const { options, transport } = createCaptureTransport({
      useAsyncLocalStorage: true
    })
    const app: Handles = new Elysia()
      .use(logixlysia(options))
      .get('/inner', () => 'in')
      .get('/outer', async () => {
        const inner = await app.handle(new Request('http://localhost/inner'))
        await inner.text()
        useLogger().info('after-nested')
        return 'out'
      })

    await run(app, '/outer')

    expect(transport).toHaveBeenCalledTimes(2)
    const innerLine = recordAt(transport, 0)
    expect(innerLine.level).toBe('INFO')
    expect(innerLine.meta.status).toBe(200)
    expect(innerLine.meta.request?.url).toEndWith('/inner')
    expect(transport.mock.calls[1]?.[1]).toBe('after-nested')
    expect(recordAt(transport, 1).meta.request?.url).toEndWith('/outer')
  })

  test('a user onError registered after the plugin logs with the request id and the real duration', async () => {
    const { options, transport } = createCaptureTransport({ requestId: true })
    const app = new Elysia()
      .use(logixlysia(options))
      .onError(({ log }) => {
        log?.error('mapped')
      })
      .get('/b', async () => {
        await sleep(20)
        throw new Error('x')
      })

    await run(app, '/b')

    const mapped = transport.mock.calls.findIndex(call => call[1] === 'mapped')
    const { meta } = recordAt(transport, mapped)
    expect(meta.context?.requestId).toBeDefined()
    expect(meta.durationMs).toBeGreaterThanOrEqual(15)
  })

  test('sets X-Request-Id on a response from an auth macro short-circuit', async () => {
    const { options, transport } = createCaptureTransport({ requestId: true })
    const app = new Elysia()
      .use(logixlysia(options))
      .macro({ auth: { resolve: () => status(401, 'no') } })
      .get('/p', () => 'x', { auth: true })

    const { response } = await run(app, '/p')

    expect(response.status).toBe(401)
    const header = response.headers.get('x-request-id')
    expect(header?.length).toBeGreaterThan(0)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).meta.context?.requestId).toBe(header)
  })

  test('useLogger() outside the request is a no-op', async () => {
    const { options, transport } = createCaptureTransport({
      useAsyncLocalStorage: true
    })
    const app = new Elysia().use(logixlysia(options)).get('/x', () => 'ok')

    await run(app, '/x')

    expect(transport).toHaveBeenCalledTimes(1)
    useLogger().info('after')
    expect(transport).toHaveBeenCalledTimes(1)
  })

  test('writes exactly one line for plain, throwing, streaming and early-return routes', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .onRequest(({ request, set }) => {
        if (new URL(request.url).pathname === '/early') {
          set.status = 429
          return 'busy'
        }
      })
      .get('/plain', () => 'ok')
      .get('/throw', () => {
        throw new Error('t')
      })
      .get('/stream', async function* quickStream() {
        yield 'a'
        yield 'b'
      })
      .get('/early', () => 'never')

    await run(app, '/plain')
    expect(transport).toHaveBeenCalledTimes(1)
    await run(app, '/throw')
    expect(transport).toHaveBeenCalledTimes(2)
    await run(app, '/stream')
    expect(transport).toHaveBeenCalledTimes(3)
    await run(app, '/early')
    expect(transport).toHaveBeenCalledTimes(4)
  })

  test('logs one 500 error line when no response can be built', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/login', ({ cookie }) => {
        // A NaN maxAge (an unset TTL, say) cannot be serialized, so the error
        // response fails too and Elysia's fetch rejects.
        cookie.session.set({ maxAge: Number.NaN, value: 'token' })
        return 'ok'
      })

    // The rejection reaches the caller untouched; a server answers it with 500.
    await expect(
      app.handle(new Request('http://localhost/login'))
    ).rejects.toThrow('option maxAge is invalid: NaN')

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('ERROR')
    expect(meta.status).toBe(500)
    expect(transport.mock.calls[0]?.[1]).toBe('option maxAge is invalid: NaN')
  })

  test('a generator that returns a status() before its first yield answers with it', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/g', async function* earlyReturn() {
        if (Date.now() > 0) {
          return status(401, 'no')
        }
        yield 'never'
      })

    const { response } = await run(app, '/g')

    expect(response.status).toBe(401)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('WARNING')
    expect(meta.status).toBe(401)
  })

  test('a generator that throws before its first yield logs one 500 line', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/g', async function* earlyThrow() {
        await sleep(1)
        if (Date.now() > 0) {
          throw new Error('early')
        }
        yield 'never'
      })

    const { response } = await run(app, '/g')

    expect(response.status).toBe(500)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('ERROR')
    expect(meta.status).toBe(500)
    expect(transport.mock.calls[0]?.[1]).toBe('early')
  })

  test('logs one 500 line when Elysia fails to start a generator stream', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/g', async function* numericContentType({ set }) {
        // Elysia reads the content type as a string after the first value,
        // so a number from untyped code makes it answer with an error
        // instead of the stream.
        const headers: Record<string, unknown> = set.headers
        headers['content-type'] = 42
        yield 'a'
        yield 'b'
      })

    const { response } = await run(app, '/g')

    expect(response.status).toBe(500)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('ERROR')
    expect(meta.status).toBe(500)
  })

  test('a generator whose first value is a ReadableStream is logged once, when the response is created', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/g', async function* streamFirst() {
        yield new ReadableStream({
          start(controller) {
            controller.enqueue('x')
            controller.close()
          }
        })
      })

    const { body } = await run(app, '/g')

    expect(body).toBe('x')
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(200)
  })

  test('an app with aot: false is still logged by the hooks', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia({ aot: false })
      .use(logixlysia(options))
      .get('/x', () => 'ok')
      .get('/boom', () => {
        throw new Error('b')
      })

    await run(app, '/x')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).level).toBe('INFO')
    expect(recordAt(transport, 0).meta.status).toBe(200)

    await run(app, '/boom')

    expect(transport).toHaveBeenCalledTimes(2)
    expect(recordAt(transport, 1).level).toBe('ERROR')
    expect(recordAt(transport, 1).meta.status).toBe(500)
    expect(transport.mock.calls[1]?.[1]).toBe('b')
  })

  test('a plugin mounted inside group() is still logged by the hooks', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia().group('/api', group =>
      group.use(logixlysia(options)).get('/x', () => 'ok')
    )

    await run(app, '/api/x')

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(200)
  })

  test("a plugin mounted in a sub-app logs the root app's routes too", async () => {
    const { options, transport } = createCaptureTransport()
    const sub = new Elysia().use(logixlysia(options)).get('/sub', () => 'sub')
    const app = new Elysia().use(sub).get('/health', () => 'ok')

    await run(app, '/health')

    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(200)
  })

  test('a thrown plain object with code and response is a 500 on the hook path too', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia({ aot: false })
      .use(logixlysia(options))
      .get('/t', () => {
        const payload = { code: 40_001, response: 'x' }
        throw payload
      })

    const { response } = await run(app, '/t')

    expect(response.status).toBe(500)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('ERROR')
    expect(meta.status).toBe(500)
  })

  test('no plugin hook reads as async to Elysia', () => {
    const { options } = createCaptureTransport()
    const { event } = logixlysia(options)
    const hooks = [
      ...(event.request ?? []),
      ...(event.afterHandle ?? []),
      ...(event.error ?? []),
      ...(event.afterResponse ?? [])
    ]

    expect(hooks).toHaveLength(4)
    for (const hook of hooks) {
      expect(String(hook.fn)).not.toMatch(ELYSIA_IS_ASYNC)
    }
  })

  test('a plugin mounted inside group() still logs an error thrown after the handler', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia().group('/api', group =>
      group.use(logixlysia(options)).get('/x', () => 'ok', {
        afterHandle: () => {
          throw new Error('late')
        }
      })
    )

    const { response } = await run(app, '/api/x')

    expect(response.status).toBe(500)
    expect(transport).toHaveBeenCalledTimes(2)
    expect(recordAt(transport, 0).level).toBe('INFO')
    expect(recordAt(transport, 0).meta.status).toBe(200)
    expect(recordAt(transport, 1).level).toBe('ERROR')
    expect(recordAt(transport, 1).meta.status).toBe(500)
    expect(transport.mock.calls[1]?.[1]).toBe('late')
  })

  test("a body cancelled before its first read still runs the generator's cleanup", async () => {
    const { options, transport } = createCaptureTransport()
    let cleaned = false
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/c', async function* cleanupStream() {
        try {
          yield 'a'
          yield 'b'
        } finally {
          cleaned = true
        }
      })

    const response = await app.handle(new Request('http://localhost/c'))
    await response.body?.cancel()
    await sleep(30)

    expect(cleaned).toBe(true)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(200)
  })

  test("a sync generator's body cancelled before its first read still runs its cleanup", async () => {
    const { options, transport } = createCaptureTransport()
    let cleaned = false
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/c', function* syncCleanupStream() {
        try {
          yield 'a'
          yield 'b'
        } finally {
          cleaned = true
        }
      })

    const response = await app.handle(new Request('http://localhost/c'))
    await response.body?.cancel()
    await sleep(30)

    expect(cleaned).toBe(true)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('INFO')
    expect(meta.status).toBe(200)
  })

  test('settles a body cancelled before its first read even when the cleanup throws', async () => {
    const { options, transport } = createCaptureTransport()
    let stream: AsyncGenerator<unknown, void> | undefined
    const app = new Elysia()
      .use(logixlysia(options))
      .mapResponse(({ responseValue }) => {
        stream = responseValue as AsyncGenerator<unknown, void>
      })
      .get('/c', async function* failingCleanup() {
        try {
          yield 'a'
          yield 'b'
        } finally {
          failCleanup()
        }
      })

    await app.handle(new Request('http://localhost/c'))
    // A cancelled body is Elysia calling return() on the generator. Elysia
    // drops the promise, which bun:test would report as unhandled, so the
    // test makes that call itself and awaits the rejection.
    await expect(stream?.return()).rejects.toThrow('cleanup failed')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).meta.status).toBe(200)
  })

  test("settles a sync generator's body cancelled before its first read even when the cleanup throws", async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .get('/c', function* failingSyncCleanup() {
        try {
          yield 'a'
          yield 'b'
        } finally {
          failCleanup()
        }
      })

    const response = await app.handle(new Request('http://localhost/c'))
    await expect(response.body?.cancel()).rejects.toThrow('cleanup failed')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).meta.status).toBe(200)
  })

  test('logs an error a later onError maps to a redirect as an error line with the final status', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(logixlysia(options))
      .onError(({ set }) => {
        set.status = 302
        set.headers.location = '/login'
        return 'moved'
      })
      .get('/x', () => {
        throw new Error('session expired')
      })

    const { response } = await run(app, '/x')

    expect(response.status).toBe(302)
    expect(transport).toHaveBeenCalledTimes(1)
    const { level, meta } = recordAt(transport, 0)
    expect(level).toBe('ERROR')
    expect(meta.status).toBe(302)
    expect(transport.mock.calls[0]?.[1]).toBe('session expired')
  })
})
