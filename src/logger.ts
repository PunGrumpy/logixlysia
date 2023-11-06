import * as pc from 'picocolors'
import { durationString } from './utils/duration'
import { methodString } from './utils/method'

enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR'
}

interface Logger {
  info: (
    request: {
      headers: { get: (key: string) => any }
      method: string
      url: string
    },
    data: {
      status?: number
      message?: string
    },
    store: {
      beforeTime: bigint
    }
  ) => void
  warning: (
    request: {
      headers: { get: (key: string) => any }
      method: string
      url: string
    },
    data: {
      status?: number
      message?: string
    },
    store: {
      beforeTime: bigint
    }
  ) => void
  error: (
    request: {
      headers: { get: (key: string) => any }
      method: string
      url: string
    },
    data: {
      status?: number
      message?: string
    },
    store: {
      beforeTime: bigint
    }
  ) => void
}

/**
 * Logs a message to the console.
 *
 * @param {LogLevel} level - The log level.
 * @param {object} request - The request object.
 * @param {object} data - The data object.
 * @param {object} store - The store object.
 * @returns {object} - The log object.
 */
function log(
  level: LogLevel,
  request: {
    headers: { get: (key: string) => any }
    method: string
    url: string
  },
  data: { status?: number; message?: string },
  store: { beforeTime: bigint }
): { [key: string]: any } | void {
  const logStr = []
  const now = new Date()

  logStr.push(
    `[${now.toISOString().replace('T', ' ').replace('Z', '').slice(0, -4)}]`
  )
  logStr.push(
    `[${
      level === LogLevel.ERROR
        ? pc.red(level)
        : level === LogLevel.WARNING
        ? pc.yellow(level)
        : pc.green(level)
    }]`
  )
  logStr.push(pc.cyan(request.headers.get('X-Forwarded-For') || ''))
  logStr.push(methodString(request.method))
  logStr.push(new URL(request.url).pathname)

  logStr.push(data.status !== undefined ? data.status : '')
  logStr.push(data.message || '')
  logStr.push(durationString(store.beforeTime))

  console.log(logStr.join(' '))
}

/**
 * Formats the logger.
 *
 * @returns {Logger} - The formatted logger.
 */
export const formatLogger = (): Logger => ({
  info: (
    request: {
      headers: { get: (key: string) => any }
      method: string
      url: string
    },
    data: {
      status?: number
      message?: string
    },
    store: {
      beforeTime: bigint
    }
  ) => log(LogLevel.INFO, request, data, store),
  warning: (
    request: {
      headers: { get: (key: string) => any }
      method: string
      url: string
    },
    data: {
      status?: number
      message?: string
    },
    store: {
      beforeTime: bigint
    }
  ) => log(LogLevel.WARNING, request, data, store),
  error: (
    request: {
      headers: { get: (key: string) => any }
      method: string
      url: string
    },
    data: {
      status?: number
      message?: string
    },
    store: {
      beforeTime: bigint
    }
  ) => log(LogLevel.ERROR, request, data, store)
})
