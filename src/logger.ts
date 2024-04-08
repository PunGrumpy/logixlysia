import chalk from 'chalk'
import durationString from './utils/duration'
import methodString from './utils/method'
import logString from './utils/log'
import pathString from './utils/path'
import statusString from './utils/status'
import { HttpError, RequestInfo } from './types'
import { LogLevel, LogData, Logger, StoreData, Options } from './types'

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
    options?.ip && request.headers.get('x-forwarded-for')
      ? `IP: ${request.headers.get('x-forwarded-for')}`
      : ''

  const logFormat =
    options?.customLogFormat ||
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
  customLogFormat: options?.customLogFormat
})

/**
 * Handles an HTTP error.
 *
 * @param {RequestInfo} request The request.
 * @param {Error} error The error.
 * @param {StoreData} store The store data.
 * @param {Options} options The options.
 */
export const handleHttpError = (
  request: RequestInfo,
  error: Error,
  store: StoreData,
  options?: Options
): void => {
  const statusCode = error instanceof HttpError ? error.status : 500
  const logMessage = buildLogMessage(
    'ERROR',
    request,
    { status: statusCode },
    store,
    options
  )
  console.error(logMessage)
}
