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
import { logToFile, logToTransports } from '../output'
import { buildLogMessage } from './build-log-message'
import { filterLog } from './filter'
import { handleHttpError } from './handle-http-error'

function getMetrics(): LogData['metrics'] {
  const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024 // MB
  const cpuUsage = process.cpuUsage()

  return {
    memoryUsage,
    cpuUsage: cpuUsage.user / 1_000_000 // convert to seconds
  }
}

function buildPinoConfig(pinoConfig: PinoConfig, rest: Partial<PinoConfig>) {
  return {
    level: pinoConfig.level || 'info',
    timestamp: pinoConfig.timestamp ?? true,
    messageKey: pinoConfig.messageKey || 'msg',
    errorKey: pinoConfig.errorKey || 'err',
    base: pinoConfig.base || { pid: process.pid },
    ...rest
  } as const
}

function createPrettyTransport(prettyPrint: boolean | object) {
  return pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
      ...(typeof prettyPrint === 'object' ? prettyPrint : {})
    }
  })
}

function createPinoInstance(options?: Options): PinoLogger {
  const pinoConfig = options?.config?.pino || {}
  const { prettyPrint, ...rest } = pinoConfig
  const config = buildPinoConfig(pinoConfig, rest)

  if (prettyPrint && process.env.NODE_ENV !== 'production') {
    return pino(config, createPrettyTransport(prettyPrint))
  }

  if (pinoConfig.transport) {
    return pino(config, pino.transport(pinoConfig.transport as never))
  }

  return pino(config)
}

function mapLogLevelToPino(level: LogLevel): string {
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
      return 'info'
  }
}

function emitPinoLog(
  pinoLogger: PinoLogger,
  level: LogLevel,
  logObject: Record<string, unknown>,
  message: string,
  options?: Options
): void {
  const pinoLevel = mapLogLevelToPino(level)
  const logMethod = pinoLogger[pinoLevel as keyof PinoLogger] as (
    ...args: unknown[]
  ) => void
  const hasCustomPinoOutput = Boolean(options?.config?.pino?.transport)
  const shouldEmitPino =
    !options?.config?.disableInternalLogger &&
    (!options?.config?.useTransportsOnly || hasCustomPinoOutput)

  if (shouldEmitPino && typeof logMethod === 'function') {
    logMethod.call(pinoLogger, logObject, message)
  }
}

async function handleOutputs(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options,
  logMessage?: string
): Promise<void> {
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
      logToFile(
        options.config.logFilePath,
        level,
        request,
        data,
        store,
        options
      )
    )
  }

  // Handle transport logging
  if (options?.config?.transports?.length) {
    promises.push(logToTransports(level, request, data, store, options))
  }

  await Promise.all(promises)
}

async function log(
  pinoLogger: PinoLogger,
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options
): Promise<void> {
  if (!filterLog(level, data.status || 200, request.method, options)) {
    return
  }

  if (!data.metrics) {
    data.metrics = getMetrics()
  }

  if (level === 'ERROR' && !data.stack) {
    const err = new Error(`Error: ${data.message || 'Unknown error'}`)
    data.stack = err.stack
  }

  const logObject = {
    level,
    method: request.method,
    url: request.url,
    status: data.status,
    message: data.message,
    context: data.context,
    metrics: data.metrics,
    duration: Number(process.hrtime.bigint() - store.beforeTime) / 1_000_000,
    ip:
      options?.config?.ip && request.headers.get('x-forwarded-for')
        ? request.headers.get('x-forwarded-for')
        : undefined,
    stack: data.stack
  }

  emitPinoLog(
    pinoLogger,
    level,
    logObject,
    data.message || 'Request processed',
    options
  )

  const logMessage = buildLogMessage(level, request, data, store, options, true)

  await handleOutputs(level, request, data, store, options, logMessage)
}

export function createLogger(options?: Options): Logger {
  const pinoLogger = createPinoInstance(options)

  const logger: Logger = {
    store: undefined,
    pino: pinoLogger, // Expose the Pino instance
    log: (level, request, data, store) =>
      log(pinoLogger, level, request, data, store, options),
    handleHttpError: async (request, error, store) =>
      await handleHttpError(request, error, store, options),
    customLogFormat: options?.config?.customLogFormat,
    info: (request, message, context, store) => {
      const storeData = store ||
        logger.store || { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return log(
        pinoLogger,
        'INFO',
        request,
        { message, context, status: 200 },
        storeData,
        options
      )
    },
    error: (request, message, context, store) => {
      const storeData = store ||
        logger.store || { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return log(
        pinoLogger,
        'ERROR',
        request,
        { message, context, status: 500 },
        storeData,
        options
      )
    },
    warn: (request, message, context, store) => {
      const storeData = store ||
        logger.store || { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return log(
        pinoLogger,
        'WARNING',
        request,
        { message, context, status: 200 },
        storeData,
        options
      )
    },
    debug: (request, message, context, store) => {
      const storeData = store ||
        logger.store || { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return log(
        pinoLogger,
        'DEBUG',
        request,
        { message, context, status: 200 },
        storeData,
        options
      )
    }
  }
  return logger
}
