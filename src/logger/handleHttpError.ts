import { HttpError, Options, RequestInfo, StoreData } from '~/types'

import { buildLogMessage } from './buildLogMessage'

/**
 * Handles an HTTP error and logs it.
 * @param {RequestInfo} request The request information.
 * @param {HttpError} error The HTTP error.
 * @param {StoreData} store The store data.
 * @param {Options} options The logger options.
 */
export async function handleHttpError(
  request: RequestInfo,
  error: HttpError,
  store: StoreData,
  options?: Options
): Promise<void> {
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
