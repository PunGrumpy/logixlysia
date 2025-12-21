import type { Logixlysia } from 'logixlysia'

export const customRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    '/custom',
    ({ request, store }) => {
      store.logger.info(request, 'Hello from custom logger', {
        feature: 'custom-route-log',
        userId: 123
      })
      return { ok: true }
    },
    {
      detail: {
        summary: 'Custom logger example',
        tags: ['logging']
      }
    }
  )
