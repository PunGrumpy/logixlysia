import {
  mergeLogDataContext,
  type RequestContextStore
} from '../context/request-context'
import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import { logToTransports } from '../output'
import { logToFile } from '../output/file'
import { normalizeLoggedError } from '../utils/error'
import { redact, redactRequest } from '../utils/redact'
import { formatLogOutput } from './create-logger'

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
  options: Options,
  contextStore?: RequestContextStore
): void => {
  const { config } = options

  const status = isErrorWithStatus(error) ? error.status : 500
  let level: LogLevel = 'ERROR'
  if (status < 500 && status >= 400) {
    level = 'WARNING'
  }

  const logFilter = config?.logFilter
  if (
    logFilter?.level &&
    logFilter.level.length > 0 &&
    !logFilter.level.includes(level)
  ) {
    return
  }

  const useTransportsOnly = config?.useTransportsOnly === true
  const disableInternalLogger = config?.disableInternalLogger === true
  const disableFileLogging = config?.disableFileLogging === true

  const { error: safeError, message } = normalizeLoggedError(
    error,
    config?.logErrorPayload === true
  )

  const data: Record<string, unknown> = { error: safeError, message, status }
  const dataWithContext = contextStore
    ? mergeLogDataContext(data, contextStore.getContext(request))
    : data
  const logData =
    config?.autoRedact === true
      ? redact(dataWithContext, config?.redactKeys)
      : dataWithContext
  const logRequest =
    config?.autoRedact === true
      ? redactRequest(request, config?.redactKeys)
      : request

  logToTransports({ data: logData, level, options, request: logRequest, store })

  if (!(useTransportsOnly || disableFileLogging)) {
    const filePath = config?.logFilePath
    if (filePath) {
      logToFile({
        data: logData,
        filePath,
        level,
        options,
        request: logRequest,
        store
      }).catch(() => {
        // Ignore errors
      })
    }
  }

  if (useTransportsOnly || disableInternalLogger) {
    return
  }

  const { main, contextLines } = formatLogOutput({
    data: logData,
    level,
    options,
    request: logRequest,
    store
  })

  const formattedMessage =
    contextLines.length > 0 ? `${main}\n${contextLines.join('\n')}` : main
  console.error(formattedMessage)
}
