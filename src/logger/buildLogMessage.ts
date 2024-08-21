import chalk from 'chalk'

import {
  LogComponents,
  LogData,
  LogLevel,
  Options,
  RequestInfo,
  StoreData
} from '~/types'
import durationString from '~/utils/duration'
import logString from '~/utils/log'
import methodString from '~/utils/method'
import pathString from '~/utils/path'
import statusString from '~/utils/status'

const defaultLogFormat =
  '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}'

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
  const now = new Date()
  const components: LogComponents = {
    now: useColors
      ? chalk.bgYellow(chalk.black(now.toLocaleString()))
      : now.toLocaleString(),
    epoch: Math.floor(now.getTime() / 1000).toString(),
    level: logString(level, useColors),
    duration: durationString(store.beforeTime, useColors),
    method: methodString(request.method, useColors),
    pathname: pathString(request),
    status: statusString(data.status || 200, useColors),
    message: data.message || '',
    ip:
      options?.config?.ip && request.headers.get('x-forwarded-for')
        ? `IP: ${request.headers.get('x-forwarded-for')}`
        : ''
  }

  const logFormat = options?.config?.customLogFormat || defaultLogFormat

  return logFormat.replace(/{(\w+)}/g, (_, key: string) => {
    if (key in components) {
      return components[key as keyof LogComponents] || ''
    }
    return ''
  })
}
