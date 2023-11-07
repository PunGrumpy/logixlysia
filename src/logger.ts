import * as pc from 'picocolors'
import { durationString } from './utils/duration'
import { methodString } from './utils/method'
import { LogData, LogLevel, logString } from './utils/log'
import { RequestInfo, pathString } from './utils/path'
import { statusString } from './utils/status'

interface StoreData {
  beforeTime: bigint
}

interface Logger {
  info(request: RequestInfo, data: LogData, store: StoreData): void
  warning(request: RequestInfo, data: LogData, store: StoreData): void
  error(request: RequestInfo, data: LogData, store: StoreData): void
}

/**
 * Logs a message to the console.
 *
 * @param level - The log level.
 * @param request - The request information.
 * @param data - The log data.
 * @param store - The store data.
 */
function log(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData
): void {
  const logStr: string[] = []
  const nowStr = pc.bgYellow(
    pc.black(
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
 * @returns The formatted logger.
 */
export const formatLogger = (): Logger => ({
  info: (request, data, store) => log(LogLevel.INFO, request, data, store),
  warning: (request, data, store) =>
    log(LogLevel.WARNING, request, data, store),
  error: (request, data, store) => log(LogLevel.ERROR, request, data, store)
})
