import type { Logixlysia } from 'logixlysia'

export const boomRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    '/boom',
    () => {
      throw new Error('Boom!')
    },
    {
      detail: {
        summary: 'Boom example',
        tags: ['error']
      }
    }
  )
