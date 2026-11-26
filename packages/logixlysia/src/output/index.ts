import { levelRank } from '../helpers/level'
import type {
  LogLevel,
  Options,
  SinkErrorContext,
  StoreData,
  Transport
} from '../interfaces'
import type { PrecomputedLogParts } from '../logger/create-logger'
import type { LoggedRequest } from '../utils/redact'
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

const isBelowMinLevel = (
  level: LogLevel,
  minLevel: LogLevel | undefined
): boolean => minLevel !== undefined && levelRank(level) < levelRank(minLevel)

interface LogToTransportsInput {
  data: Record<string, unknown>
  level: LogLevel
  options: Options
  precomputed: PrecomputedLogParts
  request: LoggedRequest
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

/** `config.service` when it names something, else `undefined`. */
export const configuredService = (options: Options): string | undefined =>
  options.config?.service?.trim() || undefined

/** The record transports receive as `meta`, and the body of the JSON console line. */
export const toRecordMeta = ({
  data,
  options,
  precomputed,
  request
}: Omit<LogToTransportsInput, 'level' | 'store'>): Record<string, unknown> => {
  // The record's request wins over a `request` key in the data.
  const { request: _dataRequest, ...ownData } = data
  const recordRequest = {
    method: request.method,
    url: options.config?.logQueryParams
      ? request.url
      : withoutQuery(request.url)
  }
  const service = configuredService(options)
  if (service === undefined) {
    return {
      request: recordRequest,
      ...ownData,
      durationMs: precomputed.durationMs
    }
  }
  // The configured service wins over a `service` key in the data.
  const { service: _dataService, ...dataWithoutService } = ownData
  return {
    request: recordRequest,
    service,
    ...dataWithoutService,
    durationMs: precomputed.durationMs
  }
}

export const logToTransports = (input: LogToTransportsInput): void => {
  const { level, data, options } = input
  const transports = options.config?.transports ?? []
  if (transports.length === 0) {
    return
  }
  const onError = options.config?.onError

  const message = typeof data.message === 'string' ? data.message : ''
  const meta = toRecordMeta(input)

  for (const transport of transports) {
    if (isBelowMinLevel(level, transport.minLevel)) {
      continue
    }
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

/** Resolves when `work` settles or `signal` aborts, whichever comes first. */
export const untilSettledOrAborted = async (
  work: Promise<unknown>,
  signal: AbortSignal
): Promise<void> => {
  if (signal.aborted) {
    return
  }
  const { promise: aborted, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  const stop = (): void => resolve()
  signal.addEventListener('abort', stop, { once: true })
  try {
    await Promise.race([work, aborted])
  } finally {
    signal.removeEventListener('abort', stop)
  }
}

const callTransport = async (
  transport: Transport,
  method: 'close' | 'flush',
  signal: AbortSignal | undefined,
  onError: ((context: SinkErrorContext) => void) | undefined
): Promise<void> => {
  try {
    await (signal ? transport[method]?.({ signal }) : transport[method]?.())
  } catch (error) {
    reportTransportError(error, onError)
  }
}

const runTransportLifecycle = (
  options: Options,
  method: 'close' | 'flush',
  signal?: AbortSignal
): Promise<unknown>[] => {
  const onError = options.config?.onError
  return (options.config?.transports ?? []).map(async transport => {
    // Yield first so the method is called from a microtask, never inline.
    await Promise.resolve()
    const call = callTransport(transport, method, signal, onError)
    // Stops waiting at the deadline whether or not the transport reads the
    // signal. A failure after that is still reported.
    await (signal ? untilSettledOrAborted(call, signal) : call)
  })
}

export const flushTransports = async (
  options: Options,
  signal?: AbortSignal
): Promise<void> => {
  const logged = Promise.allSettled(pendingTransportWork)
  await Promise.allSettled([
    signal ? untilSettledOrAborted(logged, signal) : logged,
    ...runTransportLifecycle(options, 'flush', signal)
  ])
}

export const closeTransports = async (
  options: Options,
  signal?: AbortSignal
): Promise<void> => {
  await Promise.allSettled(runTransportLifecycle(options, 'close', signal))
}
