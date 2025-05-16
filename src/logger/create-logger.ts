import type {
  LogData,
  LogLevel,
  Logger,
  Options,
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
    cpuUsage: cpuUsage.user / 1000000 // convert to seconds
  }
}

async function log(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options
): Promise<void> {
  if (!filterLog(level, data.status || 200, request.method, options)) {
    return
  }

  // Add metrics if not provided
  if (!data.metrics) {
    data.metrics = getMetrics()
  }

  // Add stack trace for errors
  if (level === 'ERROR' && !data.stack) {
    data.stack = new Error(`Error: ${data.message || 'Unknown error'}`).stack
  }

  const logMessage = buildLogMessage(level, request, data, store, options, true)
  console.log(logMessage)

  const promises: Promise<void>[] = []

  if (options?.config?.logFilePath) {
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

  if (options?.config?.transports?.length) {
    promises.push(logToTransports(level, request, data, store, options))
  }

  await Promise.all(promises)
}

export function createLogger(options?: Options): Logger {
  return {
    log: (level, request, data, store) =>
      log(level, request, data, store, options),
    handleHttpError: (request, error, store) =>
      handleHttpError(request, error, store, options),
    customLogFormat: options?.config?.customLogFormat,
    info: (request, message, context, store) => {
      const storeData = store || { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return log(
        'INFO',
        request,
        { message, context, status: 200 },
        storeData,
        options
      )
    },
    error: (request, message, context, store) => {
      const storeData = store || { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return log(
        'ERROR',
        request,
        { message, context, status: 500 },
        storeData,
        options
      )
    },
    warn: (request, message, context, store) => {
      const storeData = store || { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return log(
        'WARNING',
        request,
        { message, context, status: 200 },
        storeData,
        options
      )
    },
    debug: (request, message, context, store) => {
      const storeData = store || { beforeTime: process.hrtime.bigint() }
      storeData.hasCustomLog = true
      return log(
        'DEBUG',
        request,
        { message, context, status: 200 },
        storeData,
        options
      )
    }
  }
}
