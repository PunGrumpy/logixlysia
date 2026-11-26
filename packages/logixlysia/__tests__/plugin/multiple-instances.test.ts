import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia, useLogger } from '../../src'
import type { Options } from '../../src/interfaces'
import { sleep } from '../_helpers/sleep'

interface CapturedMeta {
  context?: Record<string, unknown>
  durationMs: number
  request?: { url: string }
  status?: number
}

const createCaptureTransport = (config: Options['config'] = {}) => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {}
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

const metas = (
  transport: ReturnType<typeof createCaptureTransport>['transport']
): CapturedMeta[] => transport.mock.calls.map(call => call[2] as CapturedMeta)

describe('logixlysia plugin - several instances', () => {
  test('each sibling module logs its own routes through its own instance', async () => {
    const a = createCaptureTransport()
    const b = createCaptureTransport()
    const moduleA = new Elysia({ prefix: '/a' })
      .use(logixlysia(a.options))
      .get('/x', () => 'a')
    const moduleB = new Elysia({ prefix: '/b' })
      .use(logixlysia(b.options))
      .get('/x', ({ log }) => {
        log.mergeContext({ tenant: 'b' })
        return 'b'
      })
    const app = new Elysia().use(moduleA).use(moduleB)

    await app.handle(new Request('http://localhost/a/x'))
    await app.handle(new Request('http://localhost/b/x'))
    await sleep(30)

    expect(metas(a.transport).map(meta => meta.request?.url)).toEqual([
      'http://localhost/a/x'
    ])
    const [line] = metas(b.transport)
    expect(metas(b.transport)).toHaveLength(1)
    expect(line?.request?.url).toBe('http://localhost/b/x')
    expect(line?.context).toEqual({ tenant: 'b' })
  })

  test("a second instance's line is timed from the start of the request", async () => {
    const a = createCaptureTransport()
    const b = createCaptureTransport()
    const moduleA = new Elysia().use(logixlysia(a.options)).get('/a', () => 'a')
    const moduleB = new Elysia()
      .use(logixlysia(b.options))
      .onBeforeHandle(async () => {
        await sleep(25)
      })
      .get('/b', () => 'b')
    const app = new Elysia().use(moduleA).use(moduleB)

    await app.handle(new Request('http://localhost/b'))
    await sleep(30)

    expect(metas(b.transport)[0]?.durationMs).toBeGreaterThanOrEqual(20)
  })

  test('an app that forwards a request to another app with its own plugin keeps its line', async () => {
    const outer = createCaptureTransport()
    const inner = createCaptureTransport()
    const innerApp = new Elysia()
      .use(logixlysia(inner.options))
      .get('/legacy', ({ set }) => {
        set.status = 202
        return 'inner'
      })
    const outerApp = new Elysia()
      .use(logixlysia(outer.options))
      .get('/legacy', ({ request }) => innerApp.handle(request))

    const response = await outerApp.handle(
      new Request('http://localhost/legacy')
    )
    await sleep(30)

    expect(response.status).toBe(202)
    expect(metas(inner.transport).map(meta => meta.status)).toEqual([202])
    expect(metas(outer.transport).map(meta => meta.status)).toEqual([202])
  })
})

describe('logixlysia plugin - several instances, tail sampling', () => {
  test('the first instance replays what it buffered for a request a later instance logged', async () => {
    const a = createCaptureTransport({
      sampling: { head: { INFO: 0 }, tail: { status: 200 } },
      useAsyncLocalStorage: true
    })
    const b = createCaptureTransport()
    const moduleA = new Elysia().use(logixlysia(a.options)).get('/a', () => 'a')
    const moduleB = new Elysia().use(logixlysia(b.options)).get('/b', () => {
      useLogger().info('from a later instance route')
      return 'b'
    })
    const app = new Elysia().use(moduleA).use(moduleB)

    await app.handle(new Request('http://localhost/b'))
    await sleep(30)

    expect(a.transport.mock.calls.map(call => call[1])).toContain(
      'from a later instance route'
    )
  })
})

describe('logixlysia plugin - several instances, request scope', () => {
  test("a later instance's lines carry the request id the response carries, and its enrichers' fields", async () => {
    const a = createCaptureTransport({
      enrichers: [() => ({ enriched: 'yes' })],
      requestId: true
    })
    const b = createCaptureTransport({
      enrichers: [() => ({ enriched: 'yes' })],
      requestId: true
    })
    const moduleA = new Elysia({ prefix: '/a' })
      .use(logixlysia(a.options))
      .get('/x', () => 'a')
    const moduleB = new Elysia({ prefix: '/b' })
      .use(logixlysia(b.options))
      .get('/x', ({ log }) => {
        log.info('one')
        log.info('two')
        return 'b'
      })
    const app = new Elysia().use(moduleA).use(moduleB)

    const response = await app.handle(new Request('http://localhost/b/x'))
    await sleep(30)

    const requestId = response.headers.get('x-request-id')
    expect(requestId).toBeString()
    expect(metas(b.transport)).toHaveLength(3)
    for (const meta of metas(b.transport)) {
      expect(meta.context).toEqual({ enriched: 'yes', requestId })
    }
    expect(
      metas(a.transport).filter(
        meta => meta.request?.url === 'http://localhost/b/x'
      )
    ).toHaveLength(0)
  })

  test('a later instance with a request id sets the header when the first instance has none', async () => {
    const a = createCaptureTransport()
    const b = createCaptureTransport({ requestId: true })
    const moduleA = new Elysia({ prefix: '/a' })
      .use(logixlysia(a.options))
      .get('/x', () => 'a')
    const moduleB = new Elysia({ prefix: '/b' })
      .use(logixlysia(b.options))
      .get('/x', () => 'b')
    const app = new Elysia().use(moduleA).use(moduleB)

    const response = await app.handle(new Request('http://localhost/b/x'))
    await sleep(30)

    const requestId = response.headers.get('x-request-id')
    expect(requestId).toBeString()
    expect(metas(b.transport)).toHaveLength(1)
    expect(metas(b.transport)[0]?.context?.requestId).toBe(requestId)
  })

  test('a later instance samples a request as a whole', async () => {
    const a = createCaptureTransport()
    const b = createCaptureTransport({ sampling: { head: { INFO: 50 } } })
    const moduleA = new Elysia({ prefix: '/a' })
      .use(logixlysia(a.options))
      .get('/x', () => 'a')
    const moduleB = new Elysia({ prefix: '/b' })
      .use(logixlysia(b.options))
      .get('/:id', ({ log }) => {
        log.info('one')
        log.info('two')
        return 'b'
      })
    const app = new Elysia().use(moduleA).use(moduleB)

    const requestCount = 200
    await Promise.all(
      Array.from({ length: requestCount }, (_, index) =>
        app.handle(new Request(`http://localhost/b/${index}`))
      )
    )
    await sleep(30)

    const groups = new Map<string, number>()
    for (const meta of metas(b.transport)) {
      const url = meta.request?.url ?? ''
      groups.set(url, (groups.get(url) ?? 0) + 1)
    }
    expect([...new Set(groups.values())]).toEqual([3])
    expect(groups.size).toBeGreaterThan(0)
    expect(groups.size).toBeLessThan(requestCount)
  })

  test("a later instance's tail rule rescues the handler's lines", async () => {
    const a = createCaptureTransport()
    const b = createCaptureTransport({
      sampling: { head: { INFO: 0 }, tail: { status: 200 } }
    })
    const moduleA = new Elysia({ prefix: '/a' })
      .use(logixlysia(a.options))
      .get('/x', () => 'a')
    const moduleB = new Elysia({ prefix: '/b' })
      .use(logixlysia(b.options))
      .get('/x', ({ log }) => {
        log.info('one')
        log.info('two')
        return 'b'
      })
    const app = new Elysia().use(moduleA).use(moduleB)

    await app.handle(new Request('http://localhost/b/x'))
    await sleep(30)

    expect(
      b.transport.mock.calls.map(call => String(call[1])).toSorted()
    ).toEqual(['', 'one', 'two'])
  })
})
