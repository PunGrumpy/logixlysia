import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestScopedLogger } from "../interfaces";

/** `Request` 是 Bun runtime 内置的全局类型(来自 undici-types),不需要 import
 *
 * @internal
 */
export const loggerStorage: AsyncLocalStorage<RequestScopedLogger> =
  new AsyncLocalStorage<RequestScopedLogger>();

/**
 * Carries the **bare Request** so `globalLogger` (no-request API) can auto-pick
 * up the current request from inside async call stacks. Populated alongside
 * `loggerStorage` in `plugin.ts` so the two are always set/unset together.
 *
 * @public
 */
export const requestStorage: AsyncLocalStorage<Request> =
  new AsyncLocalStorage<Request>();

/**
 * Fallback when no request is in flight. It is intentionally a no-op so that
 * `useLogger().info(...)` called from module-init code or test setup never
 * throws; the message is dropped and `mergeContext` is a no-op.
 */
const NOOP_LOGGER: RequestScopedLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  mergeContext: () => undefined,
  warn: () => undefined,
};

/** Falls back to a no-op logger when no request is in flight.
 *
 * @public
 */
export const useLogger = (): RequestScopedLogger =>
  loggerStorage.getStore() ?? NOOP_LOGGER;

/**
 * @internal
 */
export interface RequestScopedLoggerOptions {
  contextStore: {
    mergeContext: (key: object, partial: Record<string, unknown>) => void;
  };
  level: import("../interfaces").LogLevel;
  logger: import("../interfaces").Logger;
  request: object;
}

/**
 * Builds a RequestScopedLogger that delegates to the underlying Logger but
 * pre-binds the request — so deep call sites can `log.info('msg')` without
 * threading the Request through every signature.
 *
 * @internal
 */
export const createRequestScopedLogger = (
  logger: import("../interfaces").Logger,
  request: Request,
  contextStore: RequestScopedLoggerOptions["contextStore"]
): RequestScopedLogger => {
  const key = request as unknown as object;
  return {
    debug(message, context) {
      contextStore.mergeContext(key, context ?? {});
      logger.debug(request, message, context);
    },
    error(message, context) {
      contextStore.mergeContext(key, context ?? {});
      logger.error(request, message, context);
    },
    info(message, context) {
      contextStore.mergeContext(key, context ?? {});
      logger.info(request, message, context);
    },
    mergeContext(partial) {
      contextStore.mergeContext(key, partial);
    },
    warn(message, context) {
      contextStore.mergeContext(key, context ?? {});
      logger.warn(request, message, context);
    },
  };
};
