import { AsyncLocalStorage } from 'node:async_hooks'
import type { LogFields, RequestScopedLogger } from '../interfaces'

export const loggerStorage: AsyncLocalStorage<RequestScopedLogger> =
  new AsyncLocalStorage<RequestScopedLogger>()

/**
 * Stands in wherever no request is in flight, including after one ends: the
 * plugin restores it so a continuation that outlives its request cannot keep
 * writing into the finished request's log.
 */
const discard = (): void => {
  // Outside a request there is no log to write into.
}

export const noopRequestLogger: RequestScopedLogger = {
  debug: discard,
  error: discard,
  info: discard,
  mergeContext: discard,
  warn: discard
}

/**
 * The current request's logger, or a no-op one outside a request.
 *
 * Pass the same field type you gave the plugin to keep context typed away
 * from the Elysia handler: `useLogger<CheckoutFields>()`.
 */
export const useLogger = <
  TFields extends object = LogFields
>(): RequestScopedLogger<TFields> =>
  // The stored logger writes into an untyped context bag; the type parameter
  // only narrows what callers may hand it.
  (loggerStorage.getStore() ??
    noopRequestLogger) as RequestScopedLogger<TFields>
