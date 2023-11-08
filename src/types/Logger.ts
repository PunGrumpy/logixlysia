import { RequestInfo } from './RequestInfo'
import { StoreData } from './StoreData'

/**
 * @enum {string}
 *
 * @property {string} INFO - The info log level.
 * @property {string} WARNING - The warning log level.
 * @property {string} ERROR - The error log level.
 */
enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR'
}

/**
 * @interface LogData
 *
 * @property {number} status The status code.
 * @property {string} message The message.
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
 * @property {Function} info Logs an info message.
 * @property {Function} warning Logs a warning message.
 * @property {Function} error Logs an error message.
 */
interface Logger {
  info(request: RequestInfo, data: LogData, store: StoreData): void
  warning(request: RequestInfo, data: LogData, store: StoreData): void
  error(request: RequestInfo, data: LogData, store: StoreData): void
}

export { LogLevel, LogData, Logger }
