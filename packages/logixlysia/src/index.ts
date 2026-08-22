import { Elysia } from 'elysia'
import { resolveOptions } from './config/resolve-options'
import { createRequestContextStore } from './context/request-context'
import { loggerStorage } from './context/storage'
import { startServer } from './extensions'
import { getStatusCode } from './helpers/status'
import type {
  LogixlysiaStore,
  Options,
  RequestScopedLogger
} from './interfaces'
import { createPluginLogger } from './logger'
import { errorStatus } from './logger/handle-http-error'
import {
  getOrCreateRequestId,
  resolveRequestIdConfig
} from './middleware/request-id'
import { createWsHandlerWrapper } from './websocket/wrap-ws'

/**
 * Empty singleton slots must not use `Record<string, never>`: intersecting that with Elysia's `Context`
 * makes every key (including `store`) become `never` because each key is merged with `never`.
 */
export interface EmptyElysiaSlot {
  readonly __logixlysiaEmpty?: never
}

/**
 * Explicit singleton without Elysia's `SingletonBase` `Record<string, unknown>` on decorator/derive/resolve so
 * merged `Context` and WebSocket `ws.data` keep precise keys after `.use(logixlysia())`.
 */
export interface LogixlysiaSingleton {
  decorator: EmptyElysiaSlot
  derive: {
    log: RequestScopedLogger
  }
  resolve: EmptyElysiaSlot
  store: LogixlysiaStore
}

// Elysia's `SingletonBase.store` is `Record<string, unknown>`; `LogixlysiaStore` is intentionally closed (see #220).
// @ts-expect-error — closed store is correct at runtime and for merged `ws.data` inference.
export type Logixlysia = Elysia<'', LogixlysiaSingleton>

export type LogixlysiaPlugin = Logixlysia & {
  wrapWs: ReturnType<typeof createWsHandlerWrapper>
}

const logixlysia = (rawOptions: Options = {}): LogixlysiaPlugin => {
  const options = resolveOptions(rawOptions)
  const didCustomLog = new WeakSet<Request>()
  const requestStartTimes = new WeakMap<Request, bigint>()
  const contextStore = createRequestContextStore()
  const baseLogger = createPluginLogger(options, contextStore)
  const wrapWs = createWsHandlerWrapper(options, baseLogger, contextStore)
  const requestIdConfig = resolveRequestIdConfig(options.config?.requestId)
  const logger = {
    ...baseLogger,
    debug: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request)
      baseLogger.debug(request, message, context)
    },
    error: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request)
      baseLogger.error(request, message, context)
    },
    info: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request)
      baseLogger.info(request, message, context)
    },
    warn: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request)
      baseLogger.warn(request, message, context)
    }
  }

  const createRequestScopedLogger = (
    request: Request
  ): RequestScopedLogger => ({
    debug: (message, context) => logger.debug(request, message, context),
    error: (message, context) => logger.error(request, message, context),
    info: (message, context) => logger.info(request, message, context),
    mergeContext: partial => contextStore.mergeContext(request, partial),
    warn: (message, context) => logger.warn(request, message, context)
  })

  const app = new Elysia({
    detail: {
      description:
        'Logixlysia is a plugin for Elysia that provides a logger and pino logger.',
      tags: ['logging', 'pino']
    },
    name: 'Logixlysia'
  })

  // @ts-expect-error — derived log typing matches LogixlysiaSingleton.
  const plugin = app
    .state('logger', logger)
    .state('pino', logger.pino)
    .state('beforeTime', BigInt(0))
    .derive(({ request }) => ({ log: createRequestScopedLogger(request) }))
    .onStart(({ server }): void => {
      if (server) {
        startServer(server, options)
      } else {
        const port = Number(process.env.PORT) || 3000
        const hostname = process.env.HOST || 'localhost'
        startServer({ hostname, port, protocol: 'http' }, options)
      }
    })
    .onRequest(({ request }) => {
      requestStartTimes.set(request, process.hrtime.bigint())
      logger.beginRequest(request)
      if (requestIdConfig) {
        const requestId = getOrCreateRequestId(request, requestIdConfig)
        contextStore.mergeContext(request, { requestId })
      }

      if (options.config?.useAsyncLocalStorage) {
        loggerStorage.enterWith(createRequestScopedLogger(request))
      }
    })
    .onAfterHandle(({ request, set }) => {
      try {
        if (requestIdConfig) {
          const ctx = contextStore.getContext(request)
          const id = ctx.requestId as string | undefined
          if (id) {
            set.headers[requestIdConfig.header] = id
          }
        }

        const status =
          set.status === undefined || set.status === null
            ? 200
            : getStatusCode(set.status)

        // Resolve tail sampling before the early return: a request that only
        // emitted custom logs still needs its buffered records replayed.
        const store = {
          beforeTime: requestStartTimes.get(request) ?? BigInt(0)
        }
        logger.finalizeRequest(request, store, status)

        if (didCustomLog.has(request)) {
          return
        }

        let level: 'INFO' | 'WARNING' | 'ERROR' = 'INFO'
        if (status >= 500) {
          level = 'ERROR'
        } else if (status >= 400) {
          level = 'WARNING'
        }

        const accumulated = contextStore.getContext(request)
        const data: Record<string, unknown> = { status }
        if (Object.keys(accumulated).length > 0) {
          data.context = { ...accumulated }
        }

        logger.log(level, request, data, store)
      } finally {
        requestStartTimes.delete(request)
        contextStore.clearContext(request)
      }
    })
    .onError(({ request, error, set }) => {
      try {
        if (requestIdConfig) {
          const ctx = contextStore.getContext(request)
          const id = ctx.requestId as string | undefined
          if (id) {
            set.headers[requestIdConfig.header] = id
          }
        }
        const store = {
          beforeTime: requestStartTimes.get(request) ?? BigInt(0)
        }
        logger.finalizeRequest(request, store, errorStatus(error))
        logger.handleHttpError(request, error, store)
      } finally {
        requestStartTimes.delete(request)
        contextStore.clearContext(request)
      }
    })
    .as('scoped') as Logixlysia

  return Object.assign(plugin, { wrapWs }) as LogixlysiaPlugin
}

// biome-ignore lint/performance/noBarrelFile: public package entry re-exports
export { resolveOptions } from './config/resolve-options'
export { useLogger } from './context/storage'
export type {
  HeadSamplingConfig,
  Logger,
  LogixlysiaContext,
  LogixlysiaStore,
  LogLevel,
  LogPreset,
  Options,
  Pino,
  RequestIdConfig,
  RequestScopedLogger,
  SamplingConfig,
  StoreData,
  TailSamplingConfig,
  Transport
} from './interfaces'
export { createLogger, createPluginLogger } from './logger'
export type { ResolvedRequestIdConfig } from './middleware/request-id'
export {
  getOrCreateRequestId,
  resolveRequestIdConfig
} from './middleware/request-id'
export type {
  RequestOutcome,
  SamplingDecision,
  SamplingRuntime
} from './sampling'
export { resolveSampling } from './sampling'
export type { WsHandlerHooks } from './websocket/wrap-ws'
export { createWsHandlerWrapper } from './websocket/wrap-ws'

export default logixlysia
