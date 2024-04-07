import chalk from 'chalk'
import durationString from './utils/duration'
import methodString from './utils/method'
import logString from './utils/log'
import pathString from './utils/path'
import statusString from './utils/status'
import { HttpError, RequestInfo } from './types'
import { LogLevel, LogData, Logger, StoreData, Options } from './types'

async function log(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options
): Promise<void> {
  const logMessage = buildLogMessage(level, request, data, store, options)
  console.log(logMessage)
}

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

  let logMessage = `🦊 ${nowStr} ${levelStr} ${durationStr} ${methodStr} ${pathnameStr} ${statusStr} ${messageStr}`

  if (options?.ip) {
    const forwardedFor = request.headers.get('x-forwarded-for')
    if (forwardedFor) {
      logMessage += ` IP: ${forwardedFor}`
    }
  }

  return logMessage
}

export const createLogger = (options?: Options): Logger => ({
  log: (level, request, data, store) =>
    log(level, request, data, store, options)
})

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
