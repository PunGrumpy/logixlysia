import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import { elapsedMs } from '../utils/duration'
import { createErrorReporter } from '../utils/report'

const reportTransportError = createErrorReporter(
  'transport',
  'transport failed'
)

interface LogToTransportsInput {
  data: Record<string, unknown>
  level: LogLevel
  options: Options
  /** Duration already computed by the caller; sampled on the fly when omitted. */
  precomputed?: { durationMs: number; pathname: string; search: string }
  request: RequestInfo
  store: StoreData
}

export const logToTransports = (input: LogToTransportsInput): void => {
  const { level, request, data, store, options, precomputed } = input
  const transports = options.config?.transports ?? []
  if (transports.length === 0) {
    return
  }
  const onError = options.config?.onError

  const message = typeof data.message === 'string' ? data.message : ''
  const meta: Record<string, unknown> = {
    request: {
      method: request.method,
      url: request.url
    },
    ...data,
    durationMs: precomputed?.durationMs ?? elapsedMs(store.beforeTime)
  }

  for (const transport of transports) {
    try {
      const result = transport.log(level, message, meta)
      if (
        result &&
        typeof (result as { catch?: unknown }).catch === 'function'
      ) {
        ;(result as Promise<void>).catch(error =>
          reportTransportError(error, onError)
        )
      }
    } catch (error) {
      reportTransportError(error, onError)
    }
  }
}
