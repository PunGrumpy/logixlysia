import type {
  LogLevel,
  Options,
  RequestInfo,
  SinkErrorContext,
  StoreData
} from '../interfaces'

let lastTransportErrorAt = 0
const TRANSPORT_ERROR_INTERVAL_MS = 5000

const reportTransportError = (
  error: unknown,
  onError?: (context: SinkErrorContext) => void
): void => {
  if (onError) {
    try {
      onError({ error, sink: 'transport' })
    } catch {
      // Swallow errors thrown by the hook itself.
    }
    return
  }
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
    durationMs:
      precomputed?.durationMs ??
      (store.beforeTime === BigInt(0)
        ? 0
        : Number(process.hrtime.bigint() - store.beforeTime) / 1_000_000)
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
