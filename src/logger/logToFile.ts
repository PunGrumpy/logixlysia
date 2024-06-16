import { promises as fs } from 'fs'
import { dirname } from 'path'

import { LogData, LogLevel, Options, RequestInfo, StoreData } from '../types'
import { buildLogMessage } from './buildLogMessage'

/**
 * Ensures that the directory exists. If not, it creates the directory.
 *
 * @param {string} filePath The path to the log file.
 */
async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Logs a message to a file.
 *
 * @param {string} filePath The path to the log file.
 * @param {LogLevel} level The log level.
 * @param {RequestInfo} request The request information.
 * @param {LogData} data The log data.
 * @param {StoreData} store The store data.
 * @param {Options} options The logger options.
 */
export async function logToFile(
  filePath: string,
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options
): Promise<void> {
  await ensureDirectoryExists(filePath)
  const logMessage =
    buildLogMessage(level, request, data, store, options) + '\n'
  await fs.appendFile(filePath, logMessage)
}
