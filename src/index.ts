import { Elysia } from 'elysia'

import { startServer } from './extensions'
import { getStatusCode } from './helpers/status'
import type { HttpError, Options, Server, StoreData } from './interfaces'
import { createLogger } from './logger'

export default function logixlysia(options?: Options) {
  const log = createLogger(options)

  return new Elysia({
    name: 'Logixlysia'
  })
    .state('beforeTime', process.hrtime.bigint())
    .state('logger', log)
    .state('pino', log.pino)
    .state('hasCustomLog', false)
    .onStart(ctx => {
      const showStartupMessage = options?.config?.showStartupMessage ?? true
      if (showStartupMessage) {
        startServer(ctx.server as Server, options)
      }
    })
    .onRequest(ctx => {
      ctx.store.beforeTime = process.hrtime.bigint()
      ctx.store.logger = log
      ctx.store.pino = log.pino // Expose Pino logger directly
      ctx.store.hasCustomLog = false
      log.store = ctx.store
    })
    .onAfterHandle({ as: 'global' }, ({ request, set, store }) => {
      const storeData = store as StoreData

      if (!storeData.hasCustomLog) {
        const status = getStatusCode(set.status || 200)
        log.log(
          'INFO',
          request,
          {
            status,
            message: String(set.headers?.['x-message'] || '')
          },
          storeData
        )
      }
    })
    .onError({ as: 'global' }, async ({ request, error, set, store }) => {
      const status = getStatusCode(set.status || 500)
      await log.handleHttpError(
        request,
        { ...error, status } as HttpError,
        store as StoreData
      )
    })
}

export type {
  HttpError,
  LogData,
  Logger,
  LogixlysiaContext,
  LogLevel,
  LogRotationConfig,
  Options,
  RequestInfo,
  StoreData,
  Transport
} from './interfaces'
export { createLogger, handleHttpError } from './logger'
export { logToTransports } from './output'
