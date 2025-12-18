import type { HttpError, Options, RequestInfo, StoreData } from '../interfaces'
import { logToTransports } from '../output/console'
import { logToFile } from '../output/file'
import { buildLogMessage } from './build-log-message'

export const handleHttpError = async (
  request: RequestInfo,
  error: HttpError,
  store: StoreData,
  options?: Options
): Promise<void> => {
  const statusCode = error.status ?? 500
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
    console.error(
      buildLogMessage({
        level: 'ERROR',
        request,
        data: logData,
        store,
        options,
        useColors: true
      })
    )
  }

  // Handle file logging
  if (
    !options?.config?.useTransportsOnly &&
    options?.config?.logFilePath &&
    !options?.config?.disableFileLogging
  ) {
    promises.push(
      logToFile({
        filePath: options.config.logFilePath,
        level: 'ERROR',
        request,
        data: logData,
        store,
        options
      })
    )
  }

  // Handle transport logging
  if (options?.config?.transports?.length) {
    promises.push(
      logToTransports({
        level: 'ERROR',
        request,
        data: logData,
        store,
        options
      })
    )
  }

  await Promise.all(promises)
}
