import { LogLevelColorMap } from './colorMapping'

/**
 * Converts a log level to a colored string representation.
 *
 * @param {string} log The log level (e.g., 'INFO', 'WARNING').
 *
 * @returns {string} A colored string representing the log level.
 */
function logString(log: string): string {
  const colorFunction = LogLevelColorMap[log]

  if (colorFunction) {
    return colorFunction(log.padEnd(7))
  }

  return log
}

export default logString
