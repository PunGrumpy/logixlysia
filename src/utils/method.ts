import * as pc from 'picocolors'

interface ColorMap {
  [key: string]: (str: string) => string
}

/**
 * Converts an HTTP request method to a colored string representation.
 *
 * @param method - The HTTP request method (e.g., 'GET', 'POST').
 * @returns A colored string representing the method.
 */
function methodString(method: string): string {
  const colorMap: ColorMap = {
    GET: pc.white,
    POST: pc.yellow,
    PUT: pc.blue,
    DELETE: pc.red,
    PATCH: pc.green,
    OPTIONS: pc.cyan,
    HEAD: pc.magenta
  }

  const colorFunction = colorMap[method]

  if (colorFunction) {
    return colorFunction(method.padEnd(7))
  }

  return method
}

export { methodString }
