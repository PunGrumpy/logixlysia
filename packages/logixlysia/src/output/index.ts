import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'

let lastTransportErrorAt = 0
const TRANSPORT_ERROR_INTERVAL_MS = 5000

const reportTransportError = (error: unknown): void => {
  const now = Date.now()
  if (now - lastTransportErrorAt < TRANSPORT_ERROR_INTERVAL_MS) {
    return
  }
  lastTransportErrorAt = now
  console.error('[logixlysia] transport failed:', error)
}

interface LogToTransportsInput {
  data: Record<string, unknown>
  level: LogLevel
  options: Options
  request: RequestInfo
  store: StoreData
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
    durationMs:
      store.beforeTime === BigInt(0)
        ? 0
        : Number(process.hrtime.bigint() - store.beforeTime) / 1_000_000
  }

  for (const transport of transports) {
    try {
      const result = transport.log(level, message, meta)
      if (
        result &&
        typeof (result as { catch?: unknown }).catch === 'function'
      ) {
        ;(result as Promise<void>).catch(reportTransportError)
      }
    } catch (error) {
      reportTransportError(error)
    }
  }
}
