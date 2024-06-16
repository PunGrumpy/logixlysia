import { LogLevel } from '~/types'
import { LogLevelColorMap } from './colorMapping'

/**
 * Converts the log level to a string.
 *
 * @param {LogLevel} level The log level.
 * @returns {string} The log level as a string.
 */
function logString(level: LogLevel): string {
  const levelStr = level.toUpperCase()
  return LogLevelColorMap[levelStr]?.(levelStr.padEnd(7)) || levelStr
}

export default logString
