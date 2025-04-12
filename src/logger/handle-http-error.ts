import type { HttpError, Options, RequestInfo, StoreData } from '../interfaces'
import { logToFile } from '../output'
import { buildLogMessage } from './build-log-message'

export function handleHttpError(
  request: RequestInfo,
  error: HttpError,
  store: StoreData,
  options?: Options
): void {
  const statusCode = error.status || 500
  console.error(
    buildLogMessage('ERROR', request, { status: statusCode }, store, options)
  )

  const promises: Promise<void>[] = []

  if (options?.config?.logFilePath) {
    promises.push(
      logToFile(
        options.config.logFilePath,
        'ERROR',
        request,
        { status: statusCode },
        store,
        options
      )
    )
  }
}
