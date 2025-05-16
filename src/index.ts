import { Elysia } from 'elysia'

import { startServer } from './extensions'
import { getStatusCode } from './helpers/status'
import type { HttpError, Options, Server, StoreData } from './interfaces'
import { createLogger } from './logger'

export default function logixlysia(options?: Options): Elysia {
  const log = createLogger(options)

  return new Elysia({
    name: 'Logixlysia'
  })
    .onStart(ctx => {
      const showStartupMessage = options?.config?.showStartupMessage ?? true
      if (showStartupMessage) {
        startServer(ctx.server as Server, options)
      }
    })
    .onRequest(ctx => {
      ctx.store = {
        beforeTime: process.hrtime.bigint(),
        logger: log,
        hasCustomLog: true
      }
    })
    .onAfterHandle({ as: 'global' }, ({ request, set, store }) => {
      const storeData = store as StoreData

      if (storeData.hasCustomLog) {
        return
      }

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
    })
    .onError({ as: 'global' }, ({ request, error, set, store }) => {
      const status = getStatusCode(set.status || 500)
      log.handleHttpError(
        request,
        { ...error, status } as HttpError,
        store as StoreData
      )
    })
}

export { createLogger, handleHttpError } from './logger'
export { logToTransports } from './output'
export type {
  Logger,
  LogLevel,
  LogData,
  RequestInfo,
  StoreData,
  HttpError,
  Transport,
  Options,
  LogixlysiaContext
} from './interfaces'
