import { Elysia } from 'elysia'

import startServer from './extensions/start-server'
import { getStatusCode } from './helpers/status'
import type {
  HttpError as HttpErrorType,
  LogData as LogDataType,
  Logger as LoggerType,
  LogixlysiaContext as LogixlysiaContextType,
  LogLevel as LogLevelType,
  LogRotationConfig as LogRotationConfigType,
  Options as OptionsType,
  RequestInfo as RequestInfoType,
  Server as ServerType,
  StoreData as StoreDataType,
  Transport as TransportType
} from './interfaces'
import { createLogger as createLoggerImpl } from './logger/create-logger'
import { handleHttpError as handleHttpErrorImpl } from './logger/handle-http-error'
import { logToTransports as logToTransportsImpl } from './output/console'

export default function logixlysia(options?: OptionsType): Elysia {
  const log = createLoggerImpl(options)

  return new Elysia({
    name: 'Logixlysia'
  })
    .onStart(ctx => {
      const showStartupMessage = options?.config?.showStartupMessage ?? true
      if (showStartupMessage) {
        startServer(ctx.server as ServerType, options)
      }
    })
    .onRequest(ctx => {
      const store = {
        ...ctx.store,
        beforeTime: process.hrtime.bigint(),
        logger: log,
        pino: log.pino, // Expose Pino logger directly
        hasCustomLog: false
      }
      ctx.store = store
      log.store = store
    })
    .onAfterHandle({ as: 'global' }, ({ request, set, store }) => {
      const storeData = store as StoreDataType

      if (!storeData.hasCustomLog) {
        const status = getStatusCode(set.status ?? 200)
        log.log(
          'INFO',
          request,
          {
            status,
            message: String(set.headers?.['x-message'] ?? '')
          },
          storeData
        )
      }
    })
    .onError({ as: 'global' }, async ({ request, error, set, store }) => {
      const status = getStatusCode(set.status ?? 500)
      await log.handleHttpError(
        request,
        { ...error, status } as HttpErrorType,
        store as StoreDataType
      )
    })
}

export const createLogger = createLoggerImpl
export const handleHttpError = handleHttpErrorImpl
export const logToTransports = logToTransportsImpl

export type HttpError = HttpErrorType
export type LogData = LogDataType
export type Logger = LoggerType
export type LogixlysiaContext = LogixlysiaContextType
export type LogLevel = LogLevelType
export type LogRotationConfig = LogRotationConfigType
export type Options = OptionsType
export type RequestInfo = RequestInfoType
export type StoreData = StoreDataType
export type Transport = TransportType
