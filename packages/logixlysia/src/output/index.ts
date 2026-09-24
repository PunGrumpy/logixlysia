import type {
  LogLevel,
  Options,
  RequestInfo,
  SinkErrorContext,
  StoreData
} from '../interfaces'
import { elapsedMs } from '../utils/duration'
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
      if (result) {
        watch(result, onError)
      }
    } catch (error) {
      reportTransportError(error, onError)
    }
  }
}

/**
 * Runs one optional lifecycle method on every configured transport. Failures
 * are reported like `log()` failures and never stop the other transports.
 */
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

/** Waits for in-flight `log()` work and every transport's own `flush()`. */
export const flushTransports = async (options: Options): Promise<void> => {
  await Promise.allSettled([
    ...pendingTransportWork,
    ...runTransportLifecycle(options, 'flush')
  ])
}

/** Releases each transport's resources; only reached via `flushLogixlysia`. */
export const closeTransports = async (options: Options): Promise<void> => {
  await Promise.allSettled(runTransportLifecycle(options, 'close'))
}
