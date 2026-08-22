import { Elysia } from 'elysia'
import { resolveOptions } from './config/resolve-options'
import {
  applyRequestEnrichers,
  applyResponseEnrichers,
  resolveEnrichers
} from './context/enrich'
import { createRequestContextStore } from './context/request-context'
import { loggerStorage } from './context/storage'
import { startServer } from './extensions'
import { getStatusCode } from './helpers/status'
import type {
  LogFields,
  LogixlysiaStore,
  Options,
  RequestScopedLogger,
  StoreData
} from './interfaces'
import { createPluginLogger } from './logger'
import { errorStatus } from './logger/handle-http-error'
import {
  getOrCreateRequestId,
  resolveRequestIdConfig
} from './middleware/request-id'
import { elapsedMs } from './utils/duration'
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
export interface LogixlysiaSingleton<TFields extends object = LogFields> {
  decorator: EmptyElysiaSlot
  derive: {
    log: RequestScopedLogger<TFields>
  }
  resolve: EmptyElysiaSlot
  store: LogixlysiaStore
}

// Elysia's `SingletonBase` slots are `Record<string, unknown>`; ours are intentionally closed (see #220).
export type Logixlysia<TFields extends object = LogFields> = Elysia<
  '',
  // @ts-expect-error — closed slots are correct at runtime and for merged `ws.data` inference.
  LogixlysiaSingleton<TFields>
>

export type LogixlysiaPlugin<TFields extends object = LogFields> =
  Logixlysia<TFields> & {
    wrapWs: ReturnType<typeof createWsHandlerWrapper>
  }

/**
 * @typeParam TFields - Field bag for the request-scoped `log`. Supply your own
 * interface to have TypeScript reject misspelled context keys; the default
 * allows any key, so untyped usage is unchanged.
 */
const logixlysia = <TFields extends object = LogFields>(
  rawOptions: Options = {}
): LogixlysiaPlugin<TFields> => {
  const options = resolveOptions(rawOptions)
  const didCustomLog = new WeakSet<Request>()
  const requestStartTimes = new WeakMap<Request, bigint>()
  const contextStore = createRequestContextStore()
  const baseLogger = createPluginLogger(options, contextStore)
  const wrapWs = createWsHandlerWrapper(options, baseLogger, contextStore)
  const requestIdConfig = resolveRequestIdConfig(options.config?.requestId)
  const enrichers = resolveEnrichers(options.config?.enrichers)
  const onSinkError = options.config?.onError

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

  /**
   * The response headers an enricher gets to read. `set.headers` alone misses
   * anything a handler put on a returned `Response` (a `content-length`, say),
   * so the two are merged — with `set.headers` winning, since Elysia applies
   * it last. Only built when an enricher will actually read it.
   */
  const readableResponseHeaders = (
    setHeaders: Record<string, string | number>,
    responseHeaders?: Headers
  ): Record<string, unknown> => {
    const merged: Record<string, unknown> = {}
    responseHeaders?.forEach((value, key) => {
      merged[key] = value
    })
    return Object.assign(merged, setHeaders)
  }

  /**
   * Everything both exits share once the status is known: echo the request id,
   * run the response-phase enrichers, and resolve tail sampling — all before
   * the request's final log line, so it and any replayed records see the same
   * context. Returns the timing store for that final line.
   *
   * `setHeaders` is the live `set.headers` and is written to; the merged view
   * handed to enrichers is read-only, so it must not stand in for it.
   */
  const closeRequest = (
    request: Request,
    setHeaders: Record<string, string | number>,
    status: number,
    responseHeaders?: Headers
  ): StoreData => {
    if (requestIdConfig) {
      const id = contextStore.getContext(request).requestId as
        | string
        | undefined
      if (id) {
        setHeaders[requestIdConfig.header] = id
      }
    }

    const store: StoreData = {
      beforeTime: requestStartTimes.get(request) ?? BigInt(0)
    }

    if (enrichers) {
      applyResponseEnrichers(
        enrichers,
        contextStore,
        {
          durationMs: elapsedMs(store.beforeTime),
          headers: readableResponseHeaders(setHeaders, responseHeaders),
          request,
          status
        },
        onSinkError
      )
    }

    logger.finalizeRequest(request, store, status)
    return store
  }

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

      if (enrichers) {
        applyRequestEnrichers(enrichers, contextStore, request, onSinkError)
      }

      if (options.config?.useAsyncLocalStorage) {
        loggerStorage.enterWith(createRequestScopedLogger(request))
      }
    })
    .onAfterHandle(({ request, set, response }) => {
      try {
        const status =
          set.status === undefined || set.status === null
            ? 200
            : getStatusCode(set.status)

        // Runs before the early return: a request that only emitted custom
        // logs still needs its buffered records replayed.
        const store = closeRequest(
          request,
          set.headers,
          status,
          response instanceof Response ? response.headers : undefined
        )

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
        const store = closeRequest(request, set.headers, errorStatus(error))
        logger.handleHttpError(request, error, store)
      } finally {
        requestStartTimes.delete(request)
        contextStore.clearContext(request)
      }
    })
    .as('scoped') as Logixlysia<TFields>

  return Object.assign(plugin, { wrapWs }) as LogixlysiaPlugin<TFields>
}

// biome-ignore lint/performance/noBarrelFile: public package entry re-exports
export { resolveOptions } from './config/resolve-options'
export { useLogger } from './context/storage'
export type {
  Enricher,
  EnricherFields,
  EnricherLike,
  EnricherResponseInput,
  HeadSamplingConfig,
  LogFields,
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
