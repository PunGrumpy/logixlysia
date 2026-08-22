import { AsyncLocalStorage } from 'node:async_hooks'
import type { LogFields, RequestScopedLogger } from '../interfaces'

export const loggerStorage: AsyncLocalStorage<RequestScopedLogger> =
  new AsyncLocalStorage<RequestScopedLogger>()

const NOOP_LOGGER: RequestScopedLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  mergeContext: () => undefined,
  warn: () => undefined
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
  (loggerStorage.getStore() ?? NOOP_LOGGER) as RequestScopedLogger<TFields>
