import Elysia from 'elysia'
import { logixlysia } from 'logixlysia'
import { boomRouter } from './boom'
import { customRouter } from './custom'
import { pinoRouter } from './pino'
import { statusRouter } from './status'

export const routers = new Elysia()
  .use(
    logixlysia({
      config: {
        service: 'elysia-demo',
        timestamp: {
          translateTime: 'HH:MM:ss.SSS'
        },
        slowThreshold: 500,
        verySlowThreshold: 1000,
        showContextTree: true,
        logFilePath: './logs/example.log',
        ip: true
      }
    })
  )
  .get(
    '/',
    () => ({
      message: 'Welcome to Basic Elysia with Logixlysia'
    }),
    {
      detail: {
        summary: 'Welcome to Basic Elysia with Logixlysia',
        tags: ['welcome']
      }
    }
  )
  .use(customRouter)
  .use(pinoRouter)
  .use(statusRouter)
  .ws('/ws', {
    detail: {
      summary: 'WebSocket echo',
      description:
        'Connect with a WebSocket client to `ws://localhost:<PORT>/ws`. Incoming messages are echoed back. Open/close events are logged via Logixlysia.',
      tags: ['websocket']
    },
    open(ws) {
      ws.data.store.logger.info(ws.data.request, 'WebSocket opened', {
        demo: 'echo'
      })
    },
    message(ws, message) {
      ws.send(message)
    },
    close(ws, code, reason) {
      ws.data.store.logger.info(ws.data.request, 'WebSocket closed', {
        code,
        reason
      })
    }
  })
  .use(boomRouter)
