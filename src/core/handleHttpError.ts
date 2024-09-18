import { HttpError, Options, RequestInfo, StoreData } from '../types'
import { buildLogMessage } from './buildLogMessage'

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
}
