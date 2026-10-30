import type {
  LogLevel,
  Options,
  RequestInfo,
  SinkErrorContext,
  StoreData
} from '../interfaces'
import type { PrecomputedLogParts } from '../logger/create-logger'
import { createErrorReporter } from '../utils/report'

const reportTransportError = createErrorReporter(
  'transport',
  'transport failed'
)

const MAX_TRACKED_PENDING = 1024
const pendingTransportWork = new Set<Promise<unknown>>()

/**
 * Remembers an in-flight `log()` promise so shutdown can wait for it, and
 * reports its rejection. The set is bounded: under sustained load the oldest
 * entry is dropped rather than letting a slow transport grow it without limit.
 */
const watch = async (
  pending: Promise<void>,
  onError: ((context: SinkErrorContext) => void) | undefined
): Promise<void> => {
  if (pendingTransportWork.size >= MAX_TRACKED_PENDING) {
    const oldest = pendingTransportWork.values().next().value
    if (oldest) {
      pendingTransportWork.delete(oldest)
    }
  }
  pendingTransportWork.add(pending)
  try {
    await pending
  } catch (error) {
    reportTransportError(error, onError)
  } finally {
    pendingTransportWork.delete(pending)
  }
}

interface LogToTransportsInput {
  data: Record<string, unknown>
  level: LogLevel
  options: Options
  precomputed: PrecomputedLogParts
  request: RequestInfo
  store: StoreData
}

const withoutQuery = (url: string): string => {
  const query = url.indexOf('?')
  const fragment = url.indexOf('#')
  if (query === -1 && fragment === -1) {
    return url
  }
  if (query === -1) {
    return url.slice(0, fragment)
  }
  if (fragment === -1) {
    return url.slice(0, query)
  }
  return url.slice(0, Math.min(query, fragment))
}

export const logToTransports = (input: LogToTransportsInput): void => {
  const { level, request, data, options, precomputed } = input
  const transports = options.config?.transports ?? []
  if (transports.length === 0) {
    return
  }
  const onError = options.config?.onError

  const message = typeof data.message === 'string' ? data.message : ''
  const meta: Record<string, unknown> = {
    request: {
      method: request.method,
      url: options.config?.logQueryParams
        ? request.url
        : withoutQuery(request.url)
    },
    ...data,
    durationMs: precomputed.durationMs
  }

  for (const transport of transports) {
    try {
      const result = transport.log(level, message, meta)
      if (result) {
        watch(result, onError)
      }
    } catch (error) {
      reportTransportError(error, onError)
    }
  }
}

const runTransportLifecycle = (
  options: Options,
  method: 'close' | 'flush'
): Promise<unknown>[] => {
  const onError = options.config?.onError
  return (options.config?.transports ?? []).map(async transport => {
    try {
      // Yield first so the method is called from a microtask, never inline.
      await Promise.resolve()
      await transport[method]?.()
    } catch (error) {
      reportTransportError(error, onError)
    }
  })
}

export const flushTransports = async (options: Options): Promise<void> => {
  await Promise.allSettled([
    ...pendingTransportWork,
    ...runTransportLifecycle(options, 'flush')
  ])
}

export const closeTransports = async (options: Options): Promise<void> => {
  await Promise.allSettled(runTransportLifecycle(options, 'close'))
}
