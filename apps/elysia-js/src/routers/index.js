import Elysia from 'elysia'
import { logixlysia } from 'logixlysia'
import { boomRouter } from './boom.js'
import { customRouter } from './custom.js'
import { pinoRouter } from './pino.js'
import { statusRouter } from './status.js'

export const routers = new Elysia()
  .use(
    logixlysia({
      config: {
        timestamp: {
          translateTime: 'yyyy-mm-dd HH:MM:ss'
        },
        customLogFormat:
          '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip} {context}',
        logFilePath: './logs/example.log',
        ip: true
      }
    })
  )
  .get(
    '/',
    () => ({
      message: 'Welcome to Basic Elysia Node (JS) with Logixlysia'
    }),
    {
      detail: {
        summary: 'Welcome to Basic Elysia Node (JS) with Logixlysia',
        tags: ['welcome']
      }
    }
  )
  .use(customRouter)
  .use(pinoRouter)
  .use(statusRouter)
  .use(boomRouter)
