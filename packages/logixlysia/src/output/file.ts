import type {
  LogLevel,
  Options,
  RequestInfo,
  SinkErrorContext,
  StoreData
} from '../interfaces'
import { elapsedMs } from '../utils/duration'
import { sanitizeLogText } from '../utils/sanitize'
import { getFileSink } from './file-sink'

interface LogToFileInput {
  data: Record<string, unknown>
  filePath: string
  level: LogLevel
  options: Options
  /** Duration/URL parts already computed by the caller; parsed on the fly when omitted. */
  precomputed?: { durationMs: number; pathname: string; search: string }
  request: RequestInfo
  store: StoreData
}

/** Resolves the logged pathname (with query string when configured) from precomputed parts or a fresh parse. */
const resolvePathname = (
  request: RequestInfo,
  logQueryParams: boolean | undefined,
  precomputed?: { pathname: string; search: string }
): string => {
  if (precomputed) {
    const { pathname, search } = precomputed
    return logQueryParams ? `${pathname}${search}` : pathname
  }
  try {
    // Safely parse URL to avoid crashes on malformed URLs
    const { pathname, search } = new URL(request.url)
    return logQueryParams ? `${pathname}${search}` : pathname
  } catch {
    // Fallback to raw URL if parsing fails
    return request.url
  }
}

/** Reports a sink failure via `config.onError` when set (swallowing hook errors), else stderr. */
const reportSinkError = (
  config: Options['config'],
  sink: SinkErrorContext['sink'],
  fallbackMessage: string,
  error: unknown
): void => {
  const onError = config?.onError
  if (!onError) {
    console.error(fallbackMessage, error)
    return
  }
  try {
    onError({ error, sink })
  } catch {
    // Swallow errors thrown by the hook itself.
  }
}

export const logToFile = async (input: LogToFileInput): Promise<void> => {
  const { filePath, level, request, data, store, options, precomputed } = input
  const { config } = options
  const useTransportsOnly = config?.useTransportsOnly === true
  const disableFileLogging = config?.disableFileLogging === true
  if (useTransportsOnly || disableFileLogging) {
    return
  }

  const message = typeof data.message === 'string' ? data.message : ''
  const durationMs = precomputed?.durationMs ?? elapsedMs(store.beforeTime)

  const pathname = resolvePathname(request, config?.logQueryParams, precomputed)
  const line = `${level} ${durationMs.toFixed(2)}ms ${request.method} ${sanitizeLogText(pathname, 1024)} ${sanitizeLogText(message)}\n`

  const onRotationError = config?.onError
    ? (error: unknown) => reportSinkError(config, 'rotation', '', error)
    : undefined

  try {
    await getFileSink(filePath).write(line, {
      logDirMode: config?.logDirMode,
      logFileMode: config?.logFileMode,
      logRotation: config?.logRotation,
      onRotationError
    })
  } catch (error) {
    reportSinkError(
      config,
      'file',
      `[logixlysia] Failed to write to log file ${filePath}:`,
      error
    )
    throw error
  }
}
