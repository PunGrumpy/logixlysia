import { buildLogMessage } from '~/logger/buildLogMessage'
import { filterLog } from '~/logger/filter'
import { logToFile } from '~/logger/logToFile'
import { logToTransports } from '~/transports'
import {
  LogData,
  Logger,
  LogLevel,
  Options,
  RequestInfo,
  StoreData
} from '~/types'

/**
 * Logs a message to the console and optionally to a file.
 *
 * @param {LogLevel} level The log level.
 * @param {RequestInfo} request The request information.
 * @param {LogData} data The log data.
 * @param {StoreData} store The store data.
 * @param {Options} options The logger options.
 */
async function log(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options
): Promise<void> {
  if (!filterLog(level, data.status || 200, request.method, options)) return

  const logMessage = buildLogMessage(level, request, data, store, options, true)
  console.log(logMessage)

  const promises = []

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

/**
 * Creates a logger instance.
 *
 * @param {Options} options The logger options.
 * @returns {Logger} The logger instance.
 */
export function createLogger(options?: Options): Logger {
  return {
    log: (level, request, data, store) =>
      log(level, request, data, store, options),
    customLogFormat: options?.config?.customLogFormat
  }
}
