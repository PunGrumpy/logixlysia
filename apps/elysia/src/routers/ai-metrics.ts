import type { Logixlysia } from 'logixlysia'
import { mergeAIMetrics } from 'logixlysia/ai'

export const aiMetricsRouter = <App extends Logixlysia>(app: App) =>
  app.post(
    '/chat',
    ({ request, store }) => {
      mergeAIMetrics(store.logger, request, {
        model: 'demo-model',
        provider: 'example',
        inputTokens: 1200,
        outputTokens: 320,
        totalTokens: 1520,
        msToFinish: 890
      })
      return {
        ok: true,
        reply: 'Demo response — check access log for `context.ai`'
      }
    },
    {
      detail: {
        summary: 'AI metrics on access log',
        description:
          'Uses `mergeAIMetrics` from `logixlysia/ai` so LLM usage appears in the request context tree.',
        tags: ['logging', 'ai']
      }
    }
  )
