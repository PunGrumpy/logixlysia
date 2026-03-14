export const boomRouter = app =>
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
