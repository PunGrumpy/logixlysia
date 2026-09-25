import type { Logixlysia } from 'logixlysia'
// `useLogger` is logixlysia's AsyncLocalStorage lookup, not a React hook; the
// alias keeps the React hook rules from treating this helper as a component.
import { useLogger as currentRequestLogger } from 'logixlysia'

const dbQueryHelper = async () => {
  const log = currentRequestLogger()
  log.mergeContext({ query: 'SELECT * FROM users' })
  await Promise.resolve()
  log.info('Running database query in nested service')
}

export const requestContextRouter = <App extends Logixlysia>(app: App) =>
  app
    .get(
      '/checkout',
      ({ request, store }) => {
        store.logger.mergeContext(request, { userId: 'usr_demo' })
        store.logger.mergeContext(request, {
          cart: { items: 2, total: 4999 }
        })
        return {
          note: 'See access log — context merged automatically',
          ok: true
        }
      },
      {
        detail: {
          description:
            'Calls `mergeContext` during the handler. Fields appear on the automatic access log (no extra `logger.info` required).',
          summary: 'Request context accumulation',
          tags: ['logging', 'request-context']
        }
      }
    )
    .get(
      '/async-context',
      async ({ log }) => {
        log.mergeContext({ userId: 'usr_async' })
        log.info('Starting async request processing')

        await dbQueryHelper()

        return {
          note: 'Check console logs for useLogger() context propagation',
          ok: true
        }
      },
      {
        detail: {
          description:
            'Demonstrates request-scoped logging using derived `log` and global `useLogger()` inside async helper boundaries.',
          summary: 'AsyncLocalStorage logger context propagation',
          tags: ['logging', 'request-context']
        }
      }
    )
