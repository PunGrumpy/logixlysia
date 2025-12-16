import type { HttpError, Options, RequestInfo, StoreData } from '../interfaces'
import { logToFile, logToTransports } from '../output'
import { buildLogMessage } from './build-log-message'

export async function handleHttpError(
  request: RequestInfo,
  error: HttpError,
  store: StoreData,
  options?: Options
): Promise<void> {
  const statusCode = error.status || 500
  const logData = {
    status: statusCode,
    message: error.message,
    stack: error.stack
  }

  const promises: Promise<void>[] = []

  // Handle console logging
  if (
    !(
      options?.config?.useTransportsOnly ||
      options?.config?.disableInternalLogger
    )
  ) {
    console.error(buildLogMessage('ERROR', request, logData, store, options))
  }

  // Handle file logging
  if (
    !options?.config?.useTransportsOnly &&
    options?.config?.logFilePath &&
    !options?.config?.disableFileLogging
  ) {
    promises.push(
      logToFile(
        options.config.logFilePath,
        'ERROR',
        request,
        logData,
        store,
        options
      )
    )
  }

  // Handle transport logging
  if (options?.config?.transports?.length) {
    promises.push(logToTransports('ERROR', request, logData, store, options))
  }

  await Promise.all(promises)
}
