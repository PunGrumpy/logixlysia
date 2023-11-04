import * as pc from 'picocolors'

/**
 * @param {string} method
 * @returns {string}
 * @description
 * Convert the request method to a string.
 * @example
 * methodString('GET') // => 'GET'
 * methodString('POST') // => 'POST'
 * methodString('PUT') // => 'PUT'
 * methodString('DELETE') // => 'DELETE'
 * methodString('PATCH') // => 'PATCH'
 * methodString('OPTIONS') // => 'OPTIONS'
 * methodString('HEAD') // => 'HEAD'
 * methodString('UNKNOWN') // => 'UNKNOWN'
 * methodString('') // => ''
 */
function methodString(method: string): string {
  switch (method) {
    case 'GET':
      // Handle GET request
      return pc.white('GET')

    case 'POST':
      // Handle POST request
      return pc.yellow('POST')

    case 'PUT':
      // Handle PUT request
      return pc.blue('PUT')

    case 'DELETE':
      // Handle DELETE request
      return pc.red('DELETE')

    case 'PATCH':
      // Handle PATCH request
      return pc.green('PATCH')

    case 'OPTIONS':
      // Handle OPTIONS request
      return pc.gray('OPTIONS')

    case 'HEAD':
      // Handle HEAD request
      return pc.magenta('HEAD')

    default:
      // Handle unknown request method
      return method
  }
}

export { methodString }
