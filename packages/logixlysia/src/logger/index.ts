import pino from 'pino'
import pretty from 'pino-pretty'
import {
  createRequestContextStore,
  mergeLogDataContext,
  type RequestContextStore
} from '../context/request-context'
import type {
  LogFilter,
  Logger,
  LogLevel,
  Options,
  Pino,
  RequestInfo,
  StoreData
} from '../interfaces'
import { logToTransports } from '../output'
import { logToFile } from '../output/file'
import { buildPinoRedactPaths, redact, redactRequest } from '../utils/redact'
import { formatLogOutput } from './create-logger'
import { handleHttpError } from './handle-http-error'

export const createLogger = (
  options: Options = {},
  pinoFactory: typeof pino = pino,
  externalContextStore?: RequestContextStore
): Logger => {
  const contextStore = externalContextStore ?? createRequestContextStore()
  const { config } = options

  const pinoConfig = config?.pino
  const { prettyPrint, ...pinoOptions } = pinoConfig ?? {}

  const prettyPrintOptions =
    typeof prettyPrint === 'object' && prettyPrint !== null
      ? (prettyPrint as Record<string, unknown>)
      : undefined

  const enablePrettyPrint =
    prettyPrint === true || prettyPrintOptions !== undefined

  const shouldPrettyPrint =
    enablePrettyPrint && pinoOptions.transport === undefined

  const messageKey =
    (prettyPrintOptions?.messageKey as string | undefined) ??
    pinoOptions.messageKey
  const errorKey =
    (prettyPrintOptions?.errorKey as string | undefined) ?? pinoOptions.errorKey

  const basePinoOptions = {
    ...pinoOptions,
    errorKey,
    level: pinoOptions.level ?? 'info',
    messageKey,
    ...(config?.autoRedact === true && pinoOptions.redact === undefined
      ? {
          redact: {
            censor: '[REDACTED]',
            paths: buildPinoRedactPaths(config?.redactKeys)
          }
        }
      : {})
  }

  let pinoLogger: Pino

  if (shouldPrettyPrint) {
    const prettyStream = pretty({
      colorize: process.stdout?.isTTY === true,
      translateTime: config?.timestamp?.translateTime,
      ...prettyPrintOptions,
      errorKey,
      messageKey
    } as Record<string, unknown>)

    pinoLogger = pinoFactory(basePinoOptions, prettyStream)
  } else {
    pinoLogger = pinoFactory({
      ...basePinoOptions,
      transport: pinoOptions.transport
    })
  }

  const shouldLog = (level: LogLevel, logFilter?: LogFilter): boolean => {
    if (!logFilter?.level || logFilter.level.length === 0) {
      return true
    }
    return logFilter.level.includes(level)
  }

  const useTransportsOnly = config?.useTransportsOnly === true
  const disableInternalLogger = config?.disableInternalLogger === true
  const disableFileLogging = config?.disableFileLogging === true

  const hasTransports = (config?.transports?.length ?? 0) > 0
  const hasFileLogging =
    !(useTransportsOnly || disableFileLogging) && !!config?.logFilePath
  const hasInternalLogger = !(useTransportsOnly || disableInternalLogger)
  const isEffectivelyDisabled = !(
    hasTransports ||
    hasFileLogging ||
    hasInternalLogger
  )

  const log = (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ): void => {
    if (isEffectivelyDisabled || !shouldLog(level, config?.logFilter)) {
      return
    }

    const dataWithContext = mergeLogDataContext(
      data,
      contextStore.getContext(request)
    )
    const logData =
      config?.autoRedact === true
        ? redact(dataWithContext, config?.redactKeys)
        : dataWithContext
    const logRequest =
      config?.autoRedact === true
        ? redactRequest(request, config?.redactKeys)
        : request

    if (hasTransports) {
      logToTransports({
        data: logData,
        level,
        options,
        request: logRequest,
        store
      })
    }

    if (hasFileLogging) {
      const filePath = config?.logFilePath
      if (filePath) {
        logToFile({
          data: logData,
          filePath,
          level,
          options,
          request: logRequest,
          store
        }).catch(() => {
          /* Ignore errors */
        })
      }
    }

    if (!hasInternalLogger) {
      return
    }

    const { main, contextLines } = formatLogOutput({
      data: logData,
      level,
      options,
      request: logRequest,
      store
    })
    const message =
      contextLines.length > 0 ? `${main}\n${contextLines.join('\n')}` : main

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
    if (isEffectivelyDisabled || !shouldLog(level, config?.logFilter)) {
      return
    }
    const store: StoreData = { beforeTime: process.hrtime.bigint() }
    log(level, request, { context, message }, store)
  }

  return {
    debug: (request, message, context) => {
      logWithContext('DEBUG', request, message, context)
    },
    error: (request, message, context) => {
      logWithContext('ERROR', request, message, context)
    },
    getContext: request => contextStore.getContext(request),
    handleHttpError: (request, error, store) => {
      handleHttpError(request, error, store, options, contextStore)
    },
    info: (request, message, context) => {
      logWithContext('INFO', request, message, context)
    },
    log,
    mergeContext: (request, partial) => {
      contextStore.mergeContext(request, partial)
    },
    pino: pinoLogger,
    warn: (request, message, context) => {
      logWithContext('WARNING', request, message, context)
    }
  }
}

/** Plugin entry: shares one request-context store across the Elysia lifecycle. */
export const createPluginLogger = (
  options: Options,
  contextStore: RequestContextStore
): Logger => createLogger(options, pino, contextStore)
