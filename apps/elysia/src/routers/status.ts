import type { Logixlysia } from 'logixlysia'

export const statusRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    '/status/:code',
    ({ params, set }) => {
      const code = Number(params.code)
      set.status = Number.isFinite(code) ? code : 400
      return { status: set.status }
    },
    {
      detail: {
        summary: 'Status example',
        tags: ['status']
      }
    }
  )
