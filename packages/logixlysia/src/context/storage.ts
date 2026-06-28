import { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestScopedLogger } from '../interfaces'

export const loggerStorage: AsyncLocalStorage<RequestScopedLogger> =
  new AsyncLocalStorage<RequestScopedLogger>()

const NOOP_LOGGER: RequestScopedLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  mergeContext: () => undefined
}

export const useLogger = (): RequestScopedLogger =>
  loggerStorage.getStore() ?? NOOP_LOGGER
