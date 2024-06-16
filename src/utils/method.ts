import { HttpMethodColorMap } from './colorMapping'

/**
 * Converts an HTTP request method to a colored string representation.
 *
 * @param {string} method The HTTP request method (e.g., 'GET', 'POST').
 * @returns {string} A colored string representing the method.
 */
function methodString(method: string): string {
  const colorFunction = HttpMethodColorMap[method]
  return colorFunction ? colorFunction(method.padEnd(7)) : method
}

export default methodString
