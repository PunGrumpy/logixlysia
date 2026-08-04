import { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestScopedLogger } from '../interfaces'

export const loggerStorage: AsyncLocalStorage<RequestScopedLogger> =
  new AsyncLocalStorage<RequestScopedLogger>()

const NOOP_LOGGER: RequestScopedLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  mergeContext: () => undefined,
  warn: () => undefined
}

export const useLogger = (): RequestScopedLogger =>
  loggerStorage.getStore() ?? NOOP_LOGGER
