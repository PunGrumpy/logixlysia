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

  // Only log to console if internal logger is not disabled
  if (!options?.config?.disableInternalLogger) {
    console.error(buildLogMessage('ERROR', request, logData, store, options))
  }

  const promises: Promise<void>[] = []

  if (options?.config?.logFilePath) {
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

  if (options?.config?.transports?.length) {
    promises.push(logToTransports('ERROR', request, logData, store, options))
  }

  await Promise.all(promises)
}
