import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import type { PrecomputedLogParts } from '../logger/create-logger'
import { createErrorReporter } from '../utils/report'
import { sanitizeLogText } from '../utils/sanitize'
import { getFileSink } from './file-sink'

const reportFileError = createErrorReporter(
  'file',
  'failed to write to log file'
)
const reportRotationError = createErrorReporter(
  'rotation',
  'log rotation failed'
)

interface LogToFileInput {
  data: Record<string, unknown>
  filePath: string
  level: LogLevel
  options: Options
  precomputed: PrecomputedLogParts
  request: RequestInfo
  store: StoreData
}

const resolvePathname = (
  logQueryParams: boolean | undefined,
  { pathname, search }: PrecomputedLogParts
): string => (logQueryParams ? `${pathname}${search}` : pathname)

export const logToFile = async (input: LogToFileInput): Promise<void> => {
  const { filePath, level, request, data, options, precomputed } = input
  const { config } = options
  const useTransportsOnly = config?.useTransportsOnly === true
  const disableFileLogging = config?.disableFileLogging === true
  if (useTransportsOnly || disableFileLogging) {
    return
  }

  const message = typeof data.message === 'string' ? data.message : ''
  const { durationMs } = precomputed

  const pathname = resolvePathname(config?.logQueryParams, precomputed)
  const line = `${level} ${durationMs.toFixed(2)}ms ${request.method} ${sanitizeLogText(pathname, 1024)} ${sanitizeLogText(message)}\n`

  const onRotationError = (error: unknown): void =>
    reportRotationError(error, config?.onError)

  try {
    await getFileSink(filePath).write(line, {
      logDirMode: config?.logDirMode,
      logFileMode: config?.logFileMode,
      logRotation: config?.logRotation,
      onRotationError
    })
  } catch (error) {
    reportFileError(error, config?.onError)
    throw error
  }
}
