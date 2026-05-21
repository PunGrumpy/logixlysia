import { Elysia } from 'elysia'

import { logixlysia } from '../../src'
import { mergeAIMetrics } from '../../src/ai'
import type { Options } from '../../src/interfaces'
import { injectTraceContext } from '../../src/otel'

export type TransportLog = (lvl: unknown, msg: unknown, meta?: unknown) => void

/** Mirrors apps/elysia demo routes for integration tests (no cross-package import). */
export const createDemoApp = (options: Options) => {
  const logging = logixlysia(options)

  return new Elysia()
    .use(logging)
    .get('/', () => ({ message: 'ok' }))
    .get('/checkout', ({ request, store }) => {
      store.logger.mergeContext(request, { userId: 'usr_test' })
      store.logger.mergeContext(request, { cart: { items: 1, total: 100 } })
      return { ok: true }
    })
    .post('/chat', ({ request, store }) => {
      mergeAIMetrics(store.logger, request, {
        model: 'test-model',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15
      })
      return { ok: true }
    })
    .onRequest(({ request, store }) => {
      injectTraceContext(store.logger, request)
    })
    .get('/trace', () => ({ ok: true }))
}

export const silentTestOptions = (transport: TransportLog): Options => ({
  preset: 'dev',
  config: {
    transports: [{ log: transport }],
    disableInternalLogger: true,
    disableFileLogging: true,
    pino: { enabled: false }
  }
})
