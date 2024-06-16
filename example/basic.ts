import { Elysia } from 'elysia'

import logixlysia from '~/index'

const app = new Elysia({
  name: 'Basic Example'
})
  .use(
    logixlysia({
      config: {
        logFilePath: './logs/example.log',
        ip: true,
        customLogFormat:
          '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}'
        // logFilter: {
        //   level: ['ERROR', 'WARNING'],
        //   status: [500, 404],
        //   method: 'GET'
        // }
      }
    })
  )
  .get('/', () => {
    return {
      message: 'Basic Example'
    }
  })
  .get('/error', () => {
    throw new Error('This is an error message.')
  })
  .post('/', () => {
    return {
      message: 'Basic Example'
    }
  })
  .put('/', () => {
    return {
      message: 'Basic Example'
    }
  })
  .delete('/', () => {
    return {
      message: 'Basic Example'
    }
  })
  .patch('/', () => {
    return {
      message: 'Basic Example'
    }
  })

app.listen(3000)
