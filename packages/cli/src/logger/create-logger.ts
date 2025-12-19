import type { Logger as PinoLogger } from 'pino'
import pino from 'pino'
import type {
  LogData,
  Logger,
  LogLevel,
  Options,
  PinoConfig,
  RequestInfo,
  StoreData
} from '../interfaces'
import { logToTransports } from '../output/console'
import { logToFile } from '../output/file'
import { buildLogMessage } from './build-log-message'
import { filterLog } from './filter'
import { handleHttpError } from './handle-http-error'

const getMetrics = (): LogData['metrics'] => {
  const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024 // MB
  const cpuUsage = process.cpuUsage()

  return {
    memoryUsage,
    cpuUsage: cpuUsage.user / 1_000_000 // convert to seconds
  }
}

const buildPinoConfig = (pinoConfig: PinoConfig) =>
  ({
    level: pinoConfig.level || 'info',
    timestamp: pinoConfig.timestamp ?? true,
    messageKey: pinoConfig.messageKey || 'msg',
    errorKey: pinoConfig.errorKey || 'err',
    base: pinoConfig.base || { pid: process.pid }
  }) as const

const createPrettyTransport = (prettyPrint: boolean | object) =>
  pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
      ...(typeof prettyPrint === 'object' ? prettyPrint : {})
    }
  })

const createPinoInstance = (options?: Options): PinoLogger => {
  const pinoConfig = options?.config?.pino || {}
  const { prettyPrint, transport, ...rest } = pinoConfig
  const config = {
    ...buildPinoConfig(pinoConfig),
    ...rest
  }

  if (prettyPrint && process.env.NODE_ENV !== 'production') {
    return pino(config, createPrettyTransport(prettyPrint))
  }

  if (transport) {
    if (typeof transport === 'object' && 'target' in transport) {
      return pino(
        config,
        pino.transport(
          transport as pino.TransportSingleOptions | pino.TransportMultiOptions
        )
      )
    }
    console.warn(
      'Invalid transport configuration provided, falling back to default'
    )
  }

  return pino(config)
}

const mapLogLevelToPino = (level: LogLevel): string => {
  switch (level.toUpperCase()) {
    case 'DEBUG':
      return 'debug'
    case 'INFO':
      return 'info'
    case 'WARNING':
    case 'WARN':
      return 'warn'
    case 'ERROR':
      return 'error'
    default:
      console.warn(`Unknown log level "${level}", defaulting to "info"`)
      return 'info'
  }
}

const getClientIp = (
  request: RequestInfo,
  options?: Options
): string | undefined => {
  if (!options?.config?.ip) {
    return
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  if (!forwardedFor) {
    return
  }

  return forwardedFor.split(',')[0]?.trim()
}

const getErrorDetails = (
  level: LogLevel,
  data: LogData
):
  | {
      name: 'Error'
      message: string
      stack: string
    }
  | undefined => {
  if (level !== 'ERROR') {
    return
  }

  const message = data.message ?? 'Unknown error'
  const stack = data.stack ?? new Error(message).stack
  if (!stack) {
    return
  }

  return { name: 'Error', message, stack }
}

type EmitPinoLogArgs = {
  pinoLogger: PinoLogger
  level: LogLevel
  logObject: Record<string, unknown>
  message: string
  options?: Options
}

const emitPinoLog = ({
  pinoLogger,
  level,
  logObject,
  message,
  options
}: EmitPinoLogArgs): void => {
  const pinoLevel = mapLogLevelToPino(level)
  const logMethod = pinoLogger[pinoLevel as keyof PinoLogger] as (
    ...args: unknown[]
  ) => void
  const hasCustomPinoOutput = Boolean(
    options?.config?.pino?.transport || options?.config?.pino?.prettyPrint
  )
  const shouldEmitPino =
    !options?.config?.useTransportsOnly || hasCustomPinoOutput

  if (shouldEmitPino && typeof logMethod === 'function') {
    logMethod.call(pinoLogger, logObject, message)
  }
}

type HandleOutputsArgs = {
  level: LogLevel
  request: RequestInfo
  data: LogData
  store: StoreData
  options?: Options
  logMessage: string
}

const handleOutputs = async ({
  level,
  request,
  data,
  store,
  options,
  logMessage
}: HandleOutputsArgs): Promise<void> => {
  const promises: Promise<void>[] = []

  // Handle console logging
  if (
    !(
      options?.config?.useTransportsOnly ||
      options?.config?.disableInternalLogger
    )
  ) {
    console.log(logMessage)
  }

  // Handle file logging
  if (
    !options?.config?.useTransportsOnly &&
    options?.config?.logFilePath &&
    !options?.config?.disableFileLogging
  ) {
    promises.push(
      logToFile({
        filePath: options.config.logFilePath,
        level,
        request,
        data,
        store,
        options
      })
    )
  }

  // Handle transport logging
  if (options?.config?.transports?.length) {
    promises.push(logToTransports({ level, request, data, store, options }))
  }

  await Promise.all(promises)
}

export const createLogger = (options?: Options): Logger => {
  const pinoLogger = createPinoInstance(options)

  type LogInternalArgs = {
    level: LogLevel
    request: RequestInfo
    data: LogData
    store: StoreData
  }

  const logInternal = async ({
    level,
    request,
    data,
    store
  }: LogInternalArgs): Promise<void> => {
    if (!filterLog(level, data.status ?? 200, request.method, options)) {
      return
    }

    if (!data.metrics) {
      data.metrics = getMetrics()
    }

    const errorKey = options?.config?.pino?.errorKey ?? 'err'
    const err = getErrorDetails(level, data)
    const clientIp = getClientIp(request, options)

    const logObject = {
      method: request.method,
      url: request.url,
      status: data.status,
      message: data.message,
      context: data.context,
      metrics: data.metrics,
      duration: Number(process.hrtime.bigint() - store.beforeTime) / 1_000_000,
      ip: clientIp,
      [errorKey]: err
    }

    emitPinoLog({
      pinoLogger,
      level,
      logObject,
      message: data.message ?? 'Request processed',
      options
    })

    const logMessage = buildLogMessage({
      level,
      request,
      data,
      store,
      options,
      useColors: true
    })

    await handleOutputs({
      level,
      request,
      data,
      store,
      options,
      logMessage
    })
  }

  const logger: Logger = {
    store: undefined,
    pino: pinoLogger, // Expose the Pino instance
    log: (level, request, data, store) =>
      logInternal({ level, request, data, store }),
    handleHttpError: (request, error, store) =>
      handleHttpError(request, error, store, options),
    customLogFormat: options?.config?.customLogFormat,
    info: (request, message, context, store) => {
      const storeData = store ??
        logger.store ?? { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return logInternal({
        level: 'INFO',
        request,
        data: { message, context, status: 200 },
        store: storeData
      })
    },
    error: (request, message, context, store) => {
      const storeData = store ??
        logger.store ?? { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return logInternal({
        level: 'ERROR',
        request,
        data: { message, context, status: 500 },
        store: storeData
      })
    },
    warn: (request, message, context, store) => {
      const storeData = store ??
        logger.store ?? { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return logInternal({
        level: 'WARNING',
        request,
        data: { message, context, status: 200 },
        store: storeData
      })
    },
    debug: (request, message, context, store) => {
      const storeData = store ??
        logger.store ?? { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return logInternal({
        level: 'DEBUG',
        request,
        data: { message, context, status: 200 },
        store: storeData
      })
    }
  }
  return logger
}
