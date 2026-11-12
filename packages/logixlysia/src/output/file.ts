import { getStatusCode } from '../helpers/status'
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

const resolveStatus = (status: unknown): string =>
  status === undefined || status === null ? '-' : String(getStatusCode(status))

const resolveContext = (context: unknown): string => {
  if (
    context === null ||
    typeof context !== 'object' ||
    Array.isArray(context) ||
    Object.keys(context).length === 0
  ) {
    return ''
  }
  return ` ${sanitizeLogText(context, Number.POSITIVE_INFINITY)}`
}

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
  const head = `${new Date().toISOString()} ${level} ${request.method} ${sanitizeLogText(pathname, 1024)} ${resolveStatus(data.status)} ${durationMs.toFixed(2)}ms`
  const line = `${head}${message ? ` ${sanitizeLogText(message)}` : ''}${resolveContext(data.context)}\n`

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
