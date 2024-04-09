import chalk from 'chalk'
import durationString from './utils/duration'
import methodString from './utils/method'
import logString from './utils/log'
import pathString from './utils/path'
import statusString from './utils/status'
import {
  LogLevel,
  LogData,
  Logger,
  StoreData,
  Options,
  RequestInfo,
  HttpError
} from './types'

/**
 * Filters log messages.
 *
 * @param {LogLevel} logLevel The log level.
 * @param {number} status The status code.
 * @param {string} method The method.
 * @param {Options} options The options.
 * @returns {boolean} `true` if the log message should be logged, otherwise `false`.
 */
function filterLog(
  logLevel: LogLevel,
  status: number,
  method: string,
  options?: Options
): boolean {
  const filter = options?.config?.logFilter

  if (!filter) return true

  // Level
  if (filter.level) {
    if (Array.isArray(filter.level)) {
      if (!filter.level.includes(logLevel)) return false
    }
  } else {
    if (filter.level !== logLevel) return false
  }

  // Status
  if (filter.status) {
    if (Array.isArray(filter.status)) {
      if (!filter.status.includes(status)) return false
    }
  } else {
    if (filter.status !== status) return false
  }

  // Method
  if (filter.method) {
    if (Array.isArray(filter.method)) {
      if (!filter.method.includes(method)) return false
    }
  } else {
    if (filter.method !== method) return false
  }

  return true
}

/**
 * Logs a message.
 *
 * @param {LogLevel} level The log level.
 * @param {RequestInfo} request The request.
 * @param {LogData} data The log data.
 * @param {StoreData} store The store data.
 * @param {Options} options The options.
 */
function log(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options
): void {
  if (!filterLog(level, data.status || 200, request.method, options)) {
    return
  }

  const logMessage = buildLogMessage(level, request, data, store, options)
  console.log(logMessage)
}

/**
 * Builds a log message.
 *
 * @param {LogLevel} level The log level.
 * @param {RequestInfo} request The request.
 * @param {LogData} data The log data.
 * @param {StoreData} store The store data.
 * @param {Options} options The options.
 * @returns {string} The log message.
 */
function buildLogMessage(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options
): string {
  const nowStr = chalk.bgYellow(chalk.black(new Date().toLocaleString()))
  const levelStr = logString(level)
  const durationStr = durationString(store.beforeTime)
  const methodStr = methodString(request.method)
  const pathnameStr = pathString(request)
  const statusStr = statusString(data.status || 200)
  const messageStr = data.message || ''
  const ipStr =
    options?.config?.ip && request.headers.get('x-forwarded-for')
      ? `IP: ${request.headers.get('x-forwarded-for')}`
      : ''

  const logFormat =
    options?.config?.customLogFormat ||
    '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}'
  const logMessage = logFormat
    .replace('{now}', nowStr)
    .replace('{level}', levelStr)
    .replace('{duration}', durationStr)
    .replace('{method}', methodStr)
    .replace('{pathname}', pathnameStr || '')
    .replace('{status}', statusStr)
    .replace('{message}', messageStr)
    .replace('{ip}', ipStr || '')

  return logMessage
}

/**
 * Creates a logger.
 *
 * @param {Options} options The options.
 * @returns {Logger} The logger.
 */
export const createLogger = (options?: Options): Logger => ({
  log: (level, request, data, store) =>
    log(level, request, data, store, options),
  customLogFormat: options?.config?.customLogFormat
})

/**
 * Handles an HTTP error.
 *
 * @param {RequestInfo} request The request.
 * @param {HttpError} error The HTTP error.
 * @param {StoreData} store The store data.
 * @param {Options} options The options.
 */
export const handleHttpError = (
  request: RequestInfo,
  error: HttpError,
  store: StoreData,
  options?: Options
): void => {
  const statusCode = error.status || 500
  const logMessage = buildLogMessage(
    'ERROR',
    request,
    { status: statusCode },
    store,
    options
  )
  console.error(logMessage)
}
