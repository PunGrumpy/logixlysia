import chalk from 'chalk'
import { durationString } from './utils/duration'
import { methodString } from './utils/method'
import { LogData, LogLevel, logString } from './utils/log'
import { RequestInfo, pathString } from './utils/path'
import { statusString } from './utils/status'

/**
 * The store data interface.
 *
 * @interface StoreData
 *
 * @property {bigint} beforeTime The time before the request.
 */
interface StoreData {
  beforeTime: bigint
}

/**
 * The logger interface.
 *
 * @interface Logger
 *
 * @property {Function} info Logs an info message.
 * @property {Function} warning Logs a warning message.
 * @property {Function} error Logs an error message.
 */
interface Logger {
  info(request: RequestInfo, data: LogData, store: StoreData): void
  warning(request: RequestInfo, data: LogData, store: StoreData): void
  error(request: RequestInfo, data: LogData, store: StoreData): void
}

/**
 * Logs a message to the console.
 *
 * @param {LogLevel} level The log level.
 * @param {RequestInfo} request The request information.
 * @param {LogData} data The log data.
 * @param {StoreData} store The store data.
 *
 * @returns {void} The log message.
 */
function log(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData
): void {
  const logStr: string[] = []
  const nowStr = chalk.bgYellow(
    chalk.black(
      new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, -4)
    )
  )
  const levelStr = logString(level)
  const durationStr = durationString(store.beforeTime)
  const methodStr = methodString(request.method)
  const pathnameStr = pathString(request)
  const statusStr = statusString(data.status || 200)
  const messageStr = data.message || ''

  logStr.push(
    `🦊 ${nowStr} ${levelStr} ${durationStr} ${methodStr} ${pathnameStr} ${statusStr} ${messageStr}`
  )

  console.log(logStr.join(' '))
}

/**
 * Formats the logger.
 *
 * @returns {Logger} The formatted logger.
 */
export const formatLogger = (): Logger => ({
  info: (request, data, store) => log(LogLevel.INFO, request, data, store),
  warning: (request, data, store) =>
    log(LogLevel.WARNING, request, data, store),
  error: (request, data, store) => log(LogLevel.ERROR, request, data, store)
})
