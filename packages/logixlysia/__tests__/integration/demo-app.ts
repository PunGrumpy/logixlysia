import { Elysia } from 'elysia'

import logixlysia from '../../src'
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
        inputTokens: 10,
        model: 'test-model',
        outputTokens: 5,
        totalTokens: 15
      })
      return { ok: true }
    })
    .request(({ request, store }) => {
      injectTraceContext(store.logger, request)
    })
    .get('/trace', () => ({ ok: true }))
    .get('/status/:code', ({ params, set }) => {
      const code = Number(params.code)
      set.status =
        Number.isInteger(code) && code >= 200 && code <= 599 ? code : 400
      return { status: set.status }
    })
    .get('/status/name/:name', ({ params, set }) => {
      set.status = decodeURIComponent(params.name) as never // e.g. "Not Found" — exercises string statuses
      return { status: set.status }
    })
}

export const silentTestOptions = (transport: TransportLog): Options => ({
  config: {
    disableFileLogging: true,
    disableInternalLogger: true,
    pino: { enabled: false },
    transports: [{ log: transport }]
  },
  preset: 'dev'
})
