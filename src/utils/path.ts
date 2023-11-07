/**
 * @interface RequestInfo
 *
 * @property {Object} headers The request headers.
 * @property {string} method The request method.
 * @property {string} url The request URL.
 */
interface RequestInfo {
  headers: { get: (key: string) => any }
  method: string
  url: string
}

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

export { pathString, RequestInfo }
