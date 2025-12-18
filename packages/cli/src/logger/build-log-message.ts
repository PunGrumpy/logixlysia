import chalk from 'chalk'

import durationString from '../helpers/duration'
import logString from '../helpers/log'
import methodString from '../helpers/method'
import pathString from '../helpers/path'
import statusString from '../helpers/status'
import { formatTimestamp } from '../helpers/timestamp'
import type {
  LogComponents,
  LogData,
  LogLevel,
  Options,
  RequestInfo,
  StoreData
} from '../interfaces'

const defaultLogFormat =
  '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {context} {ip}'

const shouldUseColors = (useColors: boolean, options?: Options): boolean => {
  if (options?.config?.useColors !== undefined) {
    return options.config.useColors && process.env.NO_COLOR === undefined
  }
  return useColors && process.env.NO_COLOR === undefined
}

export type BuildLogMessageArgs = {
  level: LogLevel
  request: RequestInfo
  data: LogData
  store: StoreData
  options?: Options
  useColors?: boolean
}

export const buildLogMessage = ({
  level,
  request,
  data,
  store,
  options,
  useColors = true
}: BuildLogMessageArgs): string => {
  const actuallyUseColors = shouldUseColors(useColors, options)
  const now = new Date()
  const components: LogComponents = {
    now: actuallyUseColors
      ? chalk.bgYellow(
          chalk.black(formatTimestamp(now, options?.config?.timestamp))
        )
      : formatTimestamp(now, options?.config?.timestamp),
    epoch: Math.floor(now.getTime() / 1000).toString(),
    level: logString(level, useColors),
    duration: durationString(store.beforeTime, useColors),
    method: methodString(request.method, useColors),
    pathname: pathString(request),
    status: statusString(data.status ?? 200, useColors),
    message: data.message ?? '',
    context: data.context
      ? (() => {
          try {
            return JSON.stringify(data.context)
          } catch (error) {
            return `[Error serializing context: ${error instanceof Error ? error.message : 'Unknown error'}]`
          }
        })()
      : '',
    ip:
      options?.config?.ip && request.headers.get('x-forwarded-for')
        ? `IP: ${request.headers.get('x-forwarded-for')}`
        : ''
  }

  const logFormat = options?.config?.customLogFormat ?? defaultLogFormat

  return logFormat.replace(/{(\w+)}/g, (_, key: string) => {
    if (key in components) {
      return components[key as keyof LogComponents] || ''
    }
    return ''
  })
}
