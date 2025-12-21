import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import { logToTransports } from '../output'
import { logToFile } from '../output/file'
import { parseError } from '../utils/error'

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
  const useTransportsOnly = config?.useTransportsOnly === true
  const disableInternalLogger = config?.disableInternalLogger === true
  const disableFileLogging = config?.disableFileLogging === true

  const status = isErrorWithStatus(error) ? error.status : 500
  const message = parseError(error)

  const level: LogLevel = 'ERROR'
  const data: Record<string, unknown> = { status, message, error }

  logToTransports({ level, request, data, store, options })

  if (!(useTransportsOnly || disableFileLogging)) {
    const filePath = config?.logFilePath
    if (filePath) {
      logToFile({ filePath, level, request, data, store, options }).catch(
        () => {
          // Ignore errors
        }
      )
    }
  }

  if (useTransportsOnly || disableInternalLogger) {
    return
  }

  console.error(
    `${level} ${request.method} ${new URL(request.url).pathname} ${message}`
  )
}
