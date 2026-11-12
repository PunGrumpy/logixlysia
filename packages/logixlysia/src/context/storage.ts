import { AsyncLocalStorage } from 'node:async_hooks'
import type { LogFields, RequestScopedLogger } from '../interfaces'

export const loggerStorage: AsyncLocalStorage<RequestScopedLogger> =
  new AsyncLocalStorage<RequestScopedLogger>()

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

let storageEnabled = false
let storageDisabled = false
let warnedAboutFallback = false

export const recordStorageMode = (enabled: boolean): void => {
  if (enabled) {
    storageEnabled = true
  } else {
    storageDisabled = true
  }
}

const warnOnceAboutFallback = (): void => {
  const lostContextForSure = storageDisabled && !storageEnabled
  if (
    warnedAboutFallback ||
    !lostContextForSure ||
    process.env.NODE_ENV === 'production'
  ) {
    return
  }
  warnedAboutFallback = true
  console.warn(
    '[logixlysia] useLogger() returned a logger that writes nothing, so request context is lost. Set `useAsyncLocalStorage: true` in the plugin config to get the request logger.'
  )
}

/**
 * The current request's logger, or a no-op one outside a request.
 *
 * Pass the same field type you gave the plugin to keep context typed away
 * from the Elysia handler: `useLogger<CheckoutFields>()`.
 */
export const useLogger = <
  TFields extends object = LogFields
>(): RequestScopedLogger<TFields> => {
  const store = loggerStorage.getStore()
  if (!store) {
    warnOnceAboutFallback()
  }
  return (store ?? noopRequestLogger) as RequestScopedLogger<TFields>
}
