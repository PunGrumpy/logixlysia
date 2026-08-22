import type { RequestContextStore } from '../context/request-context'
import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import type { SamplingRuntime } from '../sampling'
import { normalizeLoggedError } from '../utils/error'
import type { FormatContext } from './create-logger'
import { emit, type Sinks, shouldLog } from './emit'

const isErrorWithStatus = (
  value: unknown
): value is { status: number; message?: string } =>
  typeof value === 'object' &&
  value !== null &&
  'status' in value &&
  typeof (value as { status?: unknown }).status === 'number'

/** The status a thrown value maps to; anything without one is a 500. */
export const errorStatus = (error: unknown): number =>
  isErrorWithStatus(error) ? error.status : 500

export const handleHttpError = (
  request: RequestInfo,
  error: unknown,
  store: StoreData,
  options: Options,
  contextStore: RequestContextStore,
  sinks: Sinks,
  formatContext: FormatContext,
  sampling?: SamplingRuntime
): void => {
  const { config } = options

  const status = errorStatus(error)
  const level: LogLevel = status >= 400 && status < 500 ? 'WARNING' : 'ERROR'

  // Mirrors emit()'s own gate check, but performed *before* normalizing the
  // error so a filtered-out/disabled logger never pays for that work.
  // emit() re-checks the same gate, which is cheap and keeps this function a
  // thin, provably-correct wrapper around the shared pipeline.
  if (sinks.isEffectivelyDisabled || !shouldLog(level, config?.logFilter)) {
    return
  }

  const { error: safeError, message } = normalizeLoggedError(
    error,
    config?.logErrorPayload === true
  )

  const data: Record<string, unknown> = { error: safeError, message, status }

  emit({
    contextStore,
    data,
    formatContext,
    level,
    options,
    request,
    sampling,
    sinks,
    store
  })
}
