import type { RequestContextStore } from '../context/request-context'
import { isStatusResponse, levelForStatus } from '../helpers/status'
import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import type { SamplingRuntime } from '../sampling'
import { normalizeLoggedError } from '../utils/error'
import type { FormatContext } from './create-logger'
import { emit, reportFormatError, shouldLog } from './emit'
import type { Sinks } from './emit'

const isErrorWithStatus = (
  value: unknown
): value is { status: number; message?: string } =>
  typeof value === 'object' &&
  value !== null &&
  'status' in value &&
  typeof (value as { status?: unknown }).status === 'number'

/** The status a thrown value maps to; anything without one is a 500. */
export const errorStatus = (error: unknown): number => {
  if (isStatusResponse(error)) {
    return error.code
  }
  return isErrorWithStatus(error) ? error.status : 500
}

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

  const status = store.status ?? errorStatus(error)
  // A thrown status() is logged at its own code's level. Any other thrown
  // value is an error, even when the client already got a 2xx or 3xx: that
  // is a body that failed after the headers went out.
  const level: LogLevel =
    isStatusResponse(error) || status >= 400 ? levelForStatus(status) : 'ERROR'

  // Mirrors emit()'s own gate check, but performed *before* normalizing the
  // error so a filtered-out/disabled logger never pays for that work.
  // emit() re-checks the same gate, which is cheap and keeps this function a
  // thin, provably-correct wrapper around the shared pipeline.
  if (sinks.isEffectivelyDisabled || !shouldLog(level, config?.logFilter)) {
    return
  }

  // emit guards its own work; this covers normalizing the error before it.
  try {
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
  } catch (failure) {
    reportFormatError(failure, config?.onError)
  }
}
