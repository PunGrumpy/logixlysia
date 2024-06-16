import chalk from 'chalk'

import { LogData, LogLevel, Options, RequestInfo, StoreData } from '~/types'
import durationString from '~/utils/duration'
import logString from '~/utils/log'
import methodString from '~/utils/method'
import pathString from '~/utils/path'
import statusString from '~/utils/status'

/**
 * Builds a log message.
 *
 * @param {LogLevel} level The log level.
 * @param {RequestInfo} request The request information.
 * @param {LogData} data The log data.
 * @param {StoreData} store The store data.
 * @param {Options} options The logger options.
 * @param {boolean} useColors Whether to apply colors to the log message.
 * @returns {string} The formatted log message.
 */
export function buildLogMessage(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options,
  useColors: boolean = true
): string {
  const nowStr = useColors
    ? chalk.bgYellow(chalk.black(new Date().toLocaleString()))
    : new Date().toLocaleString()
  const levelStr = logString(level, useColors)
  const durationStr = durationString(store.beforeTime, useColors)
  const methodStr = methodString(request.method, useColors)
  const pathnameStr = pathString(request)
  const statusStr = statusString(data.status || 200, useColors)
  const messageStr = data.message || ''
  const ipStr =
    options?.config?.ip && request.headers.get('x-forwarded-for')
      ? `IP: ${request.headers.get('x-forwarded-for')}`
      : ''

  const logFormat =
    options?.config?.customLogFormat ||
    '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}'

  return logFormat
    .replace('{now}', nowStr)
    .replace('{level}', levelStr)
    .replace('{duration}', durationStr)
    .replace('{method}', methodStr)
    .replace('{pathname}', pathnameStr || '')
    .replace('{status}', statusStr)
    .replace('{message}', messageStr)
    .replace('{ip}', ipStr || '')
}
