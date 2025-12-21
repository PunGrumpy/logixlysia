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
import { formatLine } from './create-logger'
import { handleHttpError } from './handle-http-error'

export const createLogger = (options: Options = {}): Logger => {
  const config = options.config

  const pinoConfig = config?.pino
  const { prettyPrint, ...pinoOptions } = pinoConfig ?? {}

  const shouldPrettyPrint =
    prettyPrint === true && pinoOptions.transport === undefined

  const transport = shouldPrettyPrint
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: process.stdout?.isTTY === true,
          translateTime: config?.timestamp?.translateTime,
          messageKey: pinoOptions.messageKey,
          errorKey: pinoOptions.errorKey
        }
      })
    : pinoOptions.transport

  const pinoLogger: Pino = pino({
    ...pinoOptions,
    level: pinoOptions.level ?? 'info',
    messageKey: pinoOptions.messageKey,
    errorKey: pinoOptions.errorKey,
    transport
  })

  const log = (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ): void => {
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

    const message = formatLine({ level, request, data, store, options })

    switch (level) {
      case 'DEBUG': {
        console.debug(message)
        break
      }
      case 'INFO': {
        console.info(message)
        break
      }
      case 'WARNING': {
        console.warn(message)
        break
      }
      case 'ERROR': {
        console.error(message)
        break
      }
      default: {
        console.log(message)
        break
      }
    }
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
