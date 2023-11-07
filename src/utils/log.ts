import * as pc from 'picocolors'

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
 * @interface StoreData
 *
 * @property {number} beforeTime The time before the request.
 */
interface ColorMap {
  [key: string]: (str: string) => string
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
    INFO: pc.bgGreen,
    WARNING: pc.bgYellow,
    ERROR: pc.bgRed
  }

  const colorFunction = colorMap[log]

  if (colorFunction) {
    return colorFunction(pc.black(log.padEnd(7)))
  }

  return log
}

export { LogLevel, LogData, logString }
