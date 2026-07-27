import type { Logixlysia } from 'logixlysia'

export const statusRouter = <App extends Logixlysia>(app: App) =>
  app
    .get(
      '/status/:code',
      ({ params, set }) => {
        const code = Number(params.code)
        set.status =
          Number.isInteger(code) && code >= 200 && code <= 599 ? code : 400
        return { status: set.status }
      },
      {
        detail: {
          summary: 'Status example',
          tags: ['status']
        }
      }
    )
    .get(
      '/status/name/:name',
      ({ params, set }) => {
        set.status = decodeURIComponent(params.name) as never // e.g. "Not Found" — exercises string statuses
        return { status: set.status }
      },
      {
        detail: {
          summary: 'String status example',
          tags: ['status']
        }
      }
    )
