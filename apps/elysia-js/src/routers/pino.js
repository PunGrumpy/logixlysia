export const pinoRouter = app =>
  app.get(
    '/pino',
    ({ store }) => {
      store.pino.info({ feature: 'pino', at: Date.now() }, 'pino log example')
      return { ok: true }
    },
    {
      detail: {
        summary: 'Pino log example',
        tags: ['logging']
      }
    }
  )
