import node from '@elysiajs/node'
import { Elysia } from 'elysia'
import { logixlysia } from 'logixlysia'

const port = Number(process.env.PORT ?? 3003)

new Elysia({
  name: 'Elysia Node (JS) with Logixlysia',
  adapter: node()
})
  .use(
    logixlysia({
      config: {
        ip: true,
        timestamp: {
          translateTime: 'yyyy-mm-dd HH:MM:ss'
        },
        customLogFormat:
          '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip} {context}',
        logFilePath: './logs/example.log'
      }
    })
  )
  .get('/', () => ({
    message: 'Welcome to Elysia Node (JS) with Logixlysia'
  }))
  .listen({ port })
