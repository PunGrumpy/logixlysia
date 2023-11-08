import chalk from 'chalk'
import { ColorMap } from '~/types/ColorMap'

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

export default logString
