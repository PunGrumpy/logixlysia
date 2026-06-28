import type { Logixlysia } from 'logixlysia'
import { useLogger } from 'logixlysia'

async function dbQueryHelper() {
  // biome-ignore lint/correctness/useHookAtTopLevel: Backend helper hook, not a React hook
  const log = useLogger()
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
          ok: true,
          note: 'See access log — context merged automatically'
        }
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
    .get(
      '/async-context',
      async ({ log }) => {
        log.mergeContext({ userId: 'usr_async' })
        log.info('Starting async request processing')

        await dbQueryHelper()

        return {
          ok: true,
          note: 'Check console logs for useLogger() context propagation'
        }
      },
      {
        detail: {
          summary: 'AsyncLocalStorage logger context propagation',
          description:
            'Demonstrates request-scoped logging using derived `log` and global `useLogger()` inside async helper boundaries.',
          tags: ['logging', 'request-context']
        }
      }
    )
