import { HttpMethodColorMap } from '~/utils/colorMapping'

/**
 * Converts an HTTP request method to a colored string representation.
 *
 * @param {string} method The HTTP request method (e.g., 'GET', 'POST').
 * @param {boolean} useColors - Whether to apply colors to the output.
 * @returns {string} A string representing the method.
 */
function methodString(method: string, useColors: boolean): string {
  const colorFunction = HttpMethodColorMap[method]
  return useColors && colorFunction
    ? colorFunction(method.padEnd(7))
    : method.padEnd(7)
}

export default methodString
