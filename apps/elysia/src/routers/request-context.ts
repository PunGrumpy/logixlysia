import type { Logixlysia } from 'logixlysia'

export const requestContextRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    '/checkout',
    ({ request, store }) => {
      store.logger.mergeContext(request, { userId: 'usr_demo' })
      store.logger.mergeContext(request, {
        cart: { items: 2, total: 4999 }
      })
      return { ok: true, note: 'See access log — context merged automatically' }
    },
    {
      detail: {
        summary: 'Request context accumulation',
        description:
          'Calls `mergeContext` during the handler. Fields appear on the automatic access log (no extra `logger.info` required).',
        tags: ['logging', 'request-context']
      }
    }
  )
