import { RequestInfo } from '~/types/RequestInfo'

/**
 * Returns the path string.
 *
 * @param {RequestInfo} path The request information.
 *
 * @returns {string} The path string.
 */
function pathString(path: RequestInfo): string {
  const url = new URL(path?.url).pathname
  return url
}

export default pathString
