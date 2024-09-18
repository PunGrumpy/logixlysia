import chalk from 'chalk'

import {
  LogComponents,
  LogData,
  LogLevel,
  Options,
  RequestInfo,
  StoreData
} from '../types'
import {
  durationString,
  logString,
  methodString,
  pathString,
  statusString
} from '../utils'

const defaultLogFormat =
  '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}'

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
