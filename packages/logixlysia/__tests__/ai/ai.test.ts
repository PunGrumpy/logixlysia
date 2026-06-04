import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

import { logixlysia } from '../../src'
import { mergeAIMetrics } from '../../src/ai'

describe('logixlysia/ai', () => {
  test('mergeAIMetrics adds ai object to access log context', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    })

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            transports: [{ log: transport }],
            disableInternalLogger: true,
            disableFileLogging: true
          }
        })
      )
      .get('/chat', ({ request, store }) => {
        mergeAIMetrics(store.logger, request, {
          model: 'claude-sonnet',
          inputTokens: 100,
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
    >(() => {
      /* noop */
    })

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
            transports: [{ log: transport }],
            disableInternalLogger: true,
            disableFileLogging: true
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
    >(() => {
      /* noop */
    })

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            transports: [{ log: transport }],
            disableInternalLogger: true,
            disableFileLogging: true
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
})
