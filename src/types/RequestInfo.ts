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

export { RequestInfo }
