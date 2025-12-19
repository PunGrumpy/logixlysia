import pino from 'pino'
import type {
  Logger,
  LogLevel,
  Options,
  Pino,
  RequestInfo,
  StoreData
} from '../interfaces'
import { logToTransports } from '../output'
import { logToFile } from '../output/file'
import { formatLine, logWithPino } from './create-logger'
import { handleHttpError } from './handle-http-error'

export const createLogger = (options: Options = {}): Logger => {
  const config = options.config

  const pinoLogger: Pino = pino({
    level: config?.pino?.level ?? 'info',
    messageKey: config?.pino?.messageKey,
    errorKey: config?.pino?.errorKey
  })

  const log = (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ): void => {
    logWithPino(pinoLogger, level, {
      ...data,
      level,
      method: request.method,
      url: request.url
    })

    logToTransports({ level, request, data, store, options })

    const useTransportsOnly = config?.useTransportsOnly === true
    const disableInternalLogger = config?.disableInternalLogger === true
    const disableFileLogging = config?.disableFileLogging === true

    if (!(useTransportsOnly || disableFileLogging)) {
      const filePath = config?.logFilePath
      if (filePath) {
        logToFile({ filePath, level, request, data, store, options }).catch(
          () => {
            // Ignore errors
          }
        )
      }
    }

    if (useTransportsOnly || disableInternalLogger) {
      return
    }

    console.log(formatLine({ level, request, data, store, options }))
  }

  const logWithContext = (
    level: LogLevel,
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ): void => {
    const store: StoreData = { beforeTime: process.hrtime.bigint() }
    log(level, request, { message, context }, store)
  }

  return {
    pino: pinoLogger,
    log,
    handleHttpError: (request, error, store) => {
      handleHttpError(request, error, store, options)
    },
    debug: (request, message, context) => {
      logWithContext('DEBUG', request, message, context)
    },
    info: (request, message, context) => {
      logWithContext('INFO', request, message, context)
    },
    warn: (request, message, context) => {
      logWithContext('WARNING', request, message, context)
    },
    error: (request, message, context) => {
      logWithContext('ERROR', request, message, context)
    }
  }
}
