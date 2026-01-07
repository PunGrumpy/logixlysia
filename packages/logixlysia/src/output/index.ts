import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'

interface LogToTransportsInput {
  level: LogLevel
  request: RequestInfo
  data: Record<string, unknown>
  store: StoreData
  options: Options
}

export const logToTransports = (
  ...args:
    | [LogToTransportsInput]
    | [LogLevel, RequestInfo, Record<string, unknown>, StoreData, Options]
): void => {
  const input: LogToTransportsInput =
    typeof args[0] === 'string'
      ? {
          level: args[0],
          request: args[1],
          data: args[2],
          store: args[3],
          options: args[4]
        }
      : args[0]

  const { level, request, data, store, options } = input
  const transports = options.config?.transports ?? []
  if (transports.length === 0) {
    return
  }

  const message = typeof data.message === 'string' ? data.message : ''
  const meta: Record<string, unknown> = {
    request: {
      method: request.method,
      url: request.url
    },
    ...data,
    beforeTime: store.beforeTime
  }

  for (const transport of transports) {
    try {
      const result = transport.log(level, message, meta)
      if (
        result &&
        typeof (result as { catch?: unknown }).catch === 'function'
      ) {
        ;(result as Promise<void>).catch(() => {
          // Ignore errors
        })
      }
    } catch {
      // Transport failures must never crash application logging.
    }
  }
}
