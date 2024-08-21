import { buildLogMessage } from "~/logger/buildLogMessage";
import { HttpError, Options, RequestInfo, StoreData } from "~/types";

/**
 * Handles an HTTP error and logs it.
 *
 * @param {RequestInfo} request The request information.
 * @param {HttpError} error The HTTP error.
 * @param {StoreData} store The store data.
 * @param {Options} options The logger options.
 */
export function handleHttpError(
  request: RequestInfo,
  error: HttpError,
  store: StoreData,
  options?: Options,
): void {
  const statusCode = error.status || 500;
  console.error(
    buildLogMessage("ERROR", request, { status: statusCode }, store, options),
  );
}
