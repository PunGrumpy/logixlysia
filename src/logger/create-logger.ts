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
    customLogFormat: options?.config?.customLogFormat
  }
}
