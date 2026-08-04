import Elysia from 'elysia'
import logixlysia from 'logixlysia'
import { aiMetricsRouter } from './ai-metrics'
import { autoRedactRouter } from './auto-redact'
import { boomRouter } from './boom'
import { customRouter } from './custom'
import { otelRouter } from './otel'
import { pinoRouter } from './pino'
import { requestContextRouter } from './request-context'
import { statusRouter } from './status'

interface DemoWs {
  data: {
    store: {
      logger: {
        mergeContext: (key: unknown, partial: Record<string, unknown>) => void
      }
    }
  }
  id?: string
  send: (payload: unknown) => void
}

export const logging = logixlysia({
  config: {
    autoRedact: true,
    ip: true,
    logFilePath: './logs/example.log',
    service: 'elysia-demo',
    slowThreshold: 500,
    timestamp: {
      translateTime: 'HH:MM:ss.SSS'
    },
    useAsyncLocalStorage: true,
    verySlowThreshold: 1000
  },
  preset: 'dev'
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
      description:
        'Lifecycle logs via `plugin.wrapWs`. Connect to `ws://localhost:<PORT>/ws`. Messages are echoed back.',
      summary: 'WebSocket echo (wrapWs)',
      tags: ['websocket']
    },
    ...logging.wrapWs('/ws', {
      close() {
        /* wrapWs logs close automatically */
      },
      message(ws, message: unknown) {
        ;(ws as unknown as DemoWs).send(message)
      },
      open(ws) {
        const socket = ws as unknown as DemoWs
        socket.data.store.logger.mergeContext(ws, { room: 'lobby' })
      }
    })
  })
  .use(boomRouter)
