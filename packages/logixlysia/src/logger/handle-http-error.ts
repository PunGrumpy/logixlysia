import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import { logToTransports } from '../output'
import { logToFile } from '../output/file'
import { parseError } from '../utils/error'
import { formatLogOutput } from './create-logger'
import { redact } from '../utils/redact'

const isErrorWithStatus = (
  value: unknown
): value is { status: number; message?: string } =>
  typeof value === 'object' &&
  value !== null &&
  'status' in value &&
  typeof (value as { status?: unknown }).status === 'number'

export const handleHttpError = (
  request: RequestInfo,
  error: unknown,
  store: StoreData,
  options: Options
): void => {
  const config = options.config

  const logFilter = config?.logFilter
  if (
    logFilter?.level &&
    logFilter.level.length > 0 &&
    !logFilter.level.includes('ERROR')
  ) {
    return
  }

  const useTransportsOnly = config?.useTransportsOnly === true
  const disableInternalLogger = config?.disableInternalLogger === true
  const disableFileLogging = config?.disableFileLogging === true

  const status = isErrorWithStatus(error) ? error.status : 500
  const message = parseError(error)

  const level: LogLevel = 'ERROR'
  const data: Record<string, unknown> = { status, message, error }
  const logData = config?.autoRedact === true ? redact(data) : data

  logToTransports({ level, request, data: logData, store, options })

  if (!(useTransportsOnly || disableFileLogging)) {
    const filePath = config?.logFilePath
    if (filePath) {
      logToFile({
        filePath,
        level,
        request,
        data: logData,
        store,
        options
      }).catch(() => {
        // Ignore errors
      })
    }
  }

  if (useTransportsOnly || disableInternalLogger) {
    return
  }

  const { main, contextLines } = formatLogOutput({
    level,
    request,
    data: logData,
    store,
    options
  })
  
  const formattedMessage =
    contextLines.length > 0 ? `${main}\n${contextLines.join('\n')}` : main
  console.error(formattedMessage)
}
