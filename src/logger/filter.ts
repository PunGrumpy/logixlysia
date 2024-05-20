import { LogLevel, Options } from '~/types'

/**
 * Filters log messages.
 *
 * @param {LogLevel} logLevel The log level.
 * @param {number} status The status code.
 * @param {string} method The method.
 * @param {Options} options The options.
 * @returns {boolean} `true` if the log message should be logged, otherwise `false`.
 */
function filterLog(
  logLevel: LogLevel,
  status: number,
  method: string,
  options?: Options
): boolean {
  const filter = options?.config?.logFilter

  if (!filter) return true

  if (filter.level) {
    if (Array.isArray(filter.level)) {
      if (!filter.level.includes(logLevel)) return false
    } else {
      if (filter.level !== logLevel) return false
    }
  }

  if (filter.status) {
    if (Array.isArray(filter.status)) {
      if (!filter.status.includes(status)) return false
    } else {
      if (filter.status !== status) return false
    }
  }

  if (filter.method) {
    if (Array.isArray(filter.method)) {
      if (!filter.method.includes(method)) return false
    } else {
      if (filter.method !== method) return false
    }
  }

  return true
}

export { filterLog }
