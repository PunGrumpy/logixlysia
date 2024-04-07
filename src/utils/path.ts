import { RequestInfo } from '~/types'

/**
 * Returns the path string.
 *
 * @param {RequestInfo} requestInfo The request info.
 *
 * @returns {string | undefined} The path string.
 */

function pathString(requestInfo: RequestInfo): string | undefined {
  try {
    return new URL(requestInfo.url).pathname
  } catch (error) {
    return undefined
  }
}

export default pathString
