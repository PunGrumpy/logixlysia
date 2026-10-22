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
