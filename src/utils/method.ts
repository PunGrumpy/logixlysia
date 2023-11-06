import * as pc from 'picocolors'

/**
 * Converts an HTTP request method to a colored string representation.
 *
 * @param {string} method - The HTTP request method (e.g., 'GET', 'POST').
 * @returns {string} - A colored string representing the method.
 */
function methodString(method: string): string {
  switch (method) {
    case 'GET':
      return pc.white('GET')
    case 'POST':
      return pc.yellow('POST')
    case 'PUT':
      return pc.blue('PUT')
    case 'DELETE':
      return pc.red('DELETE')
    case 'PATCH':
      return pc.green('PATCH')
    case 'OPTIONS':
      return pc.gray('OPTIONS')
    case 'HEAD':
      return pc.magenta('HEAD')
    default:
      return method
  }
}

export { methodString }
