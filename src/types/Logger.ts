import { RequestInfo } from './RequestInfo'
import { StoreData } from './StoreData'

/**
 * The log level, including standard and custom levels.
 *
 * @type {string}
 */
type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | string

/**
 * The log data interface.
 *
 * @interface LogData
 *
 * @property {number} status - The status code.
 * @property {string} message - The message.
 */
interface LogData {
  status?: number
  message?: string
}

/**
 * The logger interface.
 *
 * @interface Logger
 *
 * @property {Function} log - Logs a message with a given log level.
 */
interface Logger {
  log(
    level: LogLevel,
    request: RequestInfo,
    data: LogData,
    store: StoreData
  ): void
}

export { LogLevel, LogData, Logger }
