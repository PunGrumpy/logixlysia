import chalk from 'chalk'
import { ColorMap } from './colorMap'

/**
 * Converts an HTTP request method to a colored string representation.
 *
 * @param {string} method The HTTP request method (e.g., 'GET', 'POST').
 *
 * @returns {string} A colored string representing the method.
 */
function methodString(method: string): string {
  const colorMap: ColorMap = {
    GET: chalk.white,
    POST: chalk.yellow,
    PUT: chalk.blue,
    DELETE: chalk.red,
    PATCH: chalk.green,
    OPTIONS: chalk.cyan,
    HEAD: chalk.magenta
  }

  const colorFunction = colorMap[method]

  if (colorFunction) {
    return colorFunction(method.padEnd(7))
  }

  return method
}

export { methodString }
