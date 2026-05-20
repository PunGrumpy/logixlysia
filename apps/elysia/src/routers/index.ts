import Elysia from 'elysia'
import { logixlysia } from 'logixlysia'
import { aiMetricsRouter } from './ai-metrics'
import { autoRedactRouter } from './auto-redact'
import { boomRouter } from './boom'
import { customRouter } from './custom'
import { otelRouter } from './otel'
import { pinoRouter } from './pino'
import { requestContextRouter } from './request-context'
import { statusRouter } from './status'

type DemoWs = {
  data: {
    store: {
      logger: {
        mergeContext: (key: unknown, partial: Record<string, unknown>) => void
      }
    }
  }
  send: (payload: unknown) => void
  id?: string
}

export const logging = logixlysia({
  preset: 'dev',
  config: {
    service: 'elysia-demo',
    timestamp: {
      translateTime: 'HH:MM:ss.SSS'
    },
    slowThreshold: 500,
    verySlowThreshold: 1000,
    logFilePath: './logs/example.log',
    ip: true,
    autoRedact: true
  }
})

export const routers = new Elysia()
  .use(logging)
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
  .use(requestContextRouter)
  .use(aiMetricsRouter)
  .use(otelRouter)
  .use(pinoRouter)
  .use(statusRouter)
  .use(autoRedactRouter)
  .ws('/ws', {
    detail: {
      summary: 'WebSocket echo (wrapWs)',
      description:
        'Lifecycle logs via `plugin.wrapWs`. Connect to `ws://localhost:<PORT>/ws`. Messages are echoed back.',
      tags: ['websocket']
    },
    ...logging.wrapWs('/ws', {
      open(ws) {
        const socket = ws as unknown as DemoWs
        socket.data.store.logger.mergeContext(ws, { room: 'lobby' })
      },
      message(ws, message: unknown) {
        ;(ws as unknown as DemoWs).send(message)
      },
      close() {
        /* wrapWs logs close automatically */
      }
    })
  })
  .use(boomRouter)
