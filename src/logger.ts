import chalk from 'chalk'
import durationString from './utils/duration'
import methodString from './utils/method'
import logString from './utils/log'
import pathString from './utils/path'
import statusString from './utils/status'
import { RequestInfo } from './types/RequestInfo'
import { LogData, LogLevel, Logger } from './types/Logger'
import { StoreData } from './types/StoreData'

/**
 * Asynchronously logs a message constructed from various log components.
 *
 * @async
 * @param {LogLevel} level - The log level.
 * @param {RequestInfo} request - The request information.
 * @param {LogData} data - The log data.
 * @param {StoreData} store - The store data.
 *
 * @returns {Promise<void>}
 */
async function log(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData
): Promise<void> {
  const logMessage = buildLogMessage(level, request, data, store)
  try {
    await writeToLogAsync(logMessage)
  } catch (error) {
    console.error('Error logging message:', error)
  }
}

/**
 * Builds the log message string from given parameters.
 *
 * @param {LogLevel} level - The log level.
 * @param {RequestInfo} request - The request information.
 * @param {LogData} data - The log data.
 * @param {StoreData} store - The store data.
 *
 * @returns {string} - The constructed log message.
 */
function buildLogMessage(
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData
): string {
  const nowStr = chalk.bgYellow(chalk.black(new Date().toLocaleString()))
  const levelStr = logString(level)
  const durationStr = durationString(store.beforeTime)
  const methodStr = methodString(request.method)
  const pathnameStr = pathString(request)
  const statusStr = statusString(data.status || 200)
  const messageStr = data.message || ''

  return `🦊 ${nowStr} ${levelStr} ${durationStr} ${methodStr} ${pathnameStr} ${statusStr} ${messageStr}`
}

/**
 * Writes a log message to the console asynchronously.
 *
 * @async
 * @param {string} message - The message to log.
 *
 * @returns {Promise<void>}
 * @throws {Error} - If the timeout is reached.
 */
function writeToLogAsync(message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(message)
    resolve()

    setTimeout(() => {
      reject(new Error('Timed out while writing to log.'))
    })
  })
}

/**
 * Creates a logger instance with an asynchronous log method.
 *
 * @returns {Logger} - The logger instance.
 */
export const createLogger = (): Logger => ({
  log: (level, request, data, store) => log(level, request, data, store)
})
