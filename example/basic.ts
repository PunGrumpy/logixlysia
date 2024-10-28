import { Elysia } from 'elysia'

import logixlysia from '../src/index'

const app = new Elysia({
  name: 'Basic Example'
})
  .use(
    logixlysia({
      config: {
        showStartupMessage: true,
        startupMessageFormat: 'simple',
        timestamp: {
          translateTime: 'yyyy-mm-dd HH:MM:ss.SSS'
        },
        logFilePath: './logs/example.log',
        ip: true,
        customLogFormat:
          '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip} {epoch}'
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
