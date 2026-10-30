import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { mergeAIMetrics } from '../../src/ai'

describe('logixlysia/ai', () => {
  test('mergeAIMetrics adds ai object to access log context', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/chat', ({ request, store }) => {
        mergeAIMetrics(store.logger, request, {
          inputTokens: 100,
          model: 'claude-sonnet',
          outputTokens: 50,
          totalTokens: 150
        })
        return 'ok'
      })

    await app.handle(new Request('http://localhost/chat'))

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { ai?: Record<string, unknown> } }
      | undefined
    expect(meta?.context?.ai).toMatchObject({
      model: 'claude-sonnet',
      totalTokens: 150
    })
  })

  test('all AIMetrics fields are preserved in context', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})

    const allMetrics = {
      calls: 3,
      finishReason: 'stop',
      inputTokens: 200,
      model: 'gpt-4o',
      msToFinish: 1200,
      msToFirstChunk: 80,
      outputTokens: 400,
      provider: 'openai',
      reasoningTokens: 50,
      tokensPerSecond: 120,
      totalTokens: 650
    }

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/all-fields', ({ request, store }) => {
        mergeAIMetrics(store.logger, request, allMetrics)
        return 'ok'
      })

    await app.handle(new Request('http://localhost/all-fields'))

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { ai?: Record<string, unknown> } }
      | undefined
    expect(meta?.context?.ai).toEqual(allMetrics)
  })

  test('empty metrics object is a no-op', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/empty', ({ request, store }) => {
        mergeAIMetrics(store.logger, request, {})
        return 'ok'
      })

    await app.handle(new Request('http://localhost/empty'))

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { ai?: Record<string, unknown> } }
      | undefined
    expect(meta?.context?.ai).toBeUndefined()
  })

  test('sums token counts and counts calls across several merges', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/agent', ({ request, store }) => {
        mergeAIMetrics(store.logger, request, {
          inputTokens: 100,
          model: 'a',
          msToFinish: 200,
          outputTokens: 50,
          totalTokens: 150
        })
        mergeAIMetrics(store.logger, request, {
          inputTokens: 10,
          model: 'b',
          msToFinish: 30,
          outputTokens: 5,
          totalTokens: 15
        })
        return 'ok'
      })

    await app.handle(new Request('http://localhost/agent'))

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { ai?: Record<string, unknown> } }
      | undefined
    expect(meta?.context?.ai).toEqual({
      calls: 2,
      inputTokens: 110,
      model: 'b',
      msToFinish: 230,
      outputTokens: 55,
      totalTokens: 165
    })
  })

  test('honours an explicit calls count', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/batched', ({ request, store }) => {
        mergeAIMetrics(store.logger, request, { calls: 3, totalTokens: 9 })
        mergeAIMetrics(store.logger, request, { totalTokens: 1 })
        return 'ok'
      })

    await app.handle(new Request('http://localhost/batched'))

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { ai?: Record<string, unknown> } }
      | undefined
    expect(meta?.context?.ai).toEqual({ calls: 4, totalTokens: 10 })
  })

  test('keeps totals per request', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/tokens/:count', async ({ params, request, store }) => {
        await Bun.sleep(5)
        mergeAIMetrics(store.logger, request, {
          totalTokens: Number(params.count)
        })
        return 'ok'
      })

    await Promise.all([
      app.handle(new Request('http://localhost/tokens/7')),
      app.handle(new Request('http://localhost/tokens/11'))
    ])

    const totals = transport.mock.calls
      .map(
        call =>
          (
            call[2] as {
              context?: { ai?: { calls?: number; totalTokens?: number } }
            }
          )?.context?.ai
      )
      .toSorted((a, b) => (a?.totalTokens ?? 0) - (b?.totalTokens ?? 0))
    expect(totals).toEqual([
      { calls: 1, totalTokens: 7 },
      { calls: 1, totalTokens: 11 }
    ])
  })

  test('counts a merge whose calls is undefined as one call', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/undefined-calls', ({ request, store }) => {
        mergeAIMetrics(store.logger, request, {
          calls: undefined,
          totalTokens: 5
        })
        return 'ok'
      })

    await app.handle(new Request('http://localhost/undefined-calls'))

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { ai?: Record<string, unknown> } }
      | undefined
    expect(meta?.context?.ai).toEqual({ calls: 1, totalTokens: 5 })
  })
})
