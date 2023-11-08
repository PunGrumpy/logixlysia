import chalk from 'chalk'
import { ColorMap } from './colorMap'

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
 * Converts a log level to a colored string representation.
 *
 * @param {string} log The log level (e.g., 'INFO', 'WARNING').
 *
 * @returns {string} A colored string representing the log level.
 */
function logString(log: string): string {
  const colorMap: ColorMap = {
    INFO: chalk.bgGreen,
    WARNING: chalk.bgYellow,
    ERROR: chalk.bgRed
  }

  const colorFunction = colorMap[log]

  if (colorFunction) {
    return colorFunction(chalk.black(log.padEnd(7)))
  }

  return log
}

export { LogLevel, LogData, logString }
