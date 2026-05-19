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
})
