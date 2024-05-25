import {
  LogData,
  Logger,
  LogLevel,
  Options,
  RequestInfo,
  StoreData
} from '~/types'

import { buildLogMessage } from './buildLogMessage'
import { filterLog } from './filter'

/**
 * Logs a message to the console.
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
  if (!filterLog(level, data.status || 200, request.method, options)) {
    return
  }

  const logMessage = buildLogMessage(level, request, data, store, options)
  console.log(logMessage)
}

/**
 * Creates a logger instance.
 *
 * @param {Options} options The logger options.
 * @returns {Logger} The logger instance.
 */
export function createLogger(options?: Options): Logger {
  return {
    log: async (level, request, data, store) =>
      log(level, request, data, store, options),
    customLogFormat: options?.config?.customLogFormat
  }
}
