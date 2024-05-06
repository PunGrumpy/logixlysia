import { HttpError, Options, RequestInfo, StoreData } from '~/types'
import { buildLogMessage } from '.'

/**
 * Handles an HTTP error.
 *
 * @param {RequestInfo} request The request.
 * @param {HttpError} error The HTTP error.
 * @param {StoreData} store The store data.
 * @param {Options} options The options.
 */
function handleHttpError(
  request: RequestInfo,
  error: HttpError,
  store: StoreData,
  options?: Options
): void {
  const statusCode = error.status || 500
  const logMessage = buildLogMessage(
    'ERROR',
    request,
    { status: statusCode },
    store,
    options
  )
  console.error(logMessage)
}

export { handleHttpError }
