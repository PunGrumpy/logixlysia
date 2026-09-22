import { Elysia } from 'elysia'
import { resolveOptions } from './config/resolve-options'
import {
  applyRequestEnrichers,
  applyResponseEnrichers,
  resolveEnrichers
} from './context/enrich'
import { createRequestContextStore } from './context/request-context'
import { loggerStorage, noopRequestLogger } from './context/storage'
import { startServer } from './extensions'
import { getStatusCode } from './helpers/status'
import type {
  LogFields,
  LogixlysiaStore,
  LogLevel,
  Options,
  RequestScopedLogger,
  StoreData
} from './interfaces'
import { createPluginLogger } from './logger'
import { resolveSinks, shouldLog } from './logger/emit'
import { errorStatus } from './logger/handle-http-error'
import {
  getOrCreateRequestId,
  resolveRequestIdConfig
} from './middleware/request-id'
import { closeTransports } from './output'
import { closeAllFileSinks } from './output/file-sink'
import {
  flushAll,
  raceWithTimeout,
  reportShutdownTimeout
} from './output/shutdown'
import { elapsedMs } from './utils/duration'
import { createWsHandlerWrapper } from './websocket/wrap-ws'

/**
 * Empty singleton slots must not use `Record<string, never>`: intersecting that with Elysia's `Context`
 * makes every key (including `store`) become `never` because each key is merged with `never`.
 */
export interface EmptyElysiaSlot {
  readonly __logixlysiaEmpty?: never
}

const DEFAULT_STATUS = 200

/**
 * The status the client actually sees. Elysia leaves `set.status` at 200
 * unless a handler assigned one, and on the wire a returned `Response` beats
 * that untouched default — so a streaming, redirecting or proxying handler's
 * own status is the one worth logging.
 */
const resolveHandledStatus = (
  setStatus: unknown,
  response: unknown
): number => {
  if (setStatus !== undefined && setStatus !== null) {
    const assigned = getStatusCode(setStatus)
    if (assigned !== DEFAULT_STATUS) {
      return assigned
    }
  }

  if (response instanceof Response) {
    return response.status
  }

  return DEFAULT_STATUS
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

const DEFAULT_FLUSH_TIMEOUT_MS = 5000

/**
 * @typeParam TFields - Field bag for the request-scoped `log`. Supply your own
 * interface to have TypeScript reject misspelled context keys; the default
 * allows any key, so untyped usage is unchanged.
 */
const createLogixlysiaPlugin = <TFields extends object = LogFields>(
  rawOptions: Options = {}
): LogixlysiaPlugin<TFields> => {
  const options = resolveOptions(rawOptions)
  const didCustomLog = new WeakSet<Request>()
  const closed = new WeakSet<Request>()
  const requestStartTimes = new WeakMap<Request, bigint>()
  const contextStore = createRequestContextStore()
  const baseLogger = createPluginLogger(options, contextStore)
  const wrapWs = createWsHandlerWrapper(options, baseLogger, contextStore)
  const requestIdConfig = resolveRequestIdConfig(options.config?.requestId)
  const enrichers = resolveEnrichers(options.config?.enrichers)
  const onSinkError = options.config?.onError
  const logFilter = options.config?.logFilter
  const sinks = resolveSinks(options.config)

  /**
   * A custom log inside a request. It applies the same gate the logger's own
   * `debug`/`info`/... apply, for two reasons: a record the level filter drops
   * must not claim the request and suppress its access line, and the record
   * that does go out has to be timed from the request's start rather than from
   * the moment the handler called it.
   */
  const emitCustomLog = (
    level: LogLevel,
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ): void => {
    if (sinks.isEffectivelyDisabled || !shouldLog(level, logFilter)) {
      return
    }

    didCustomLog.add(request)
    baseLogger.log(
      level,
      request,
      { context, message },
      { beforeTime: requestStartTimes.get(request) ?? process.hrtime.bigint() }
    )
  }

  const logger = {
    ...baseLogger,
    debug: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      emitCustomLog('DEBUG', request, message, context)
    },
    error: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      emitCustomLog('ERROR', request, message, context)
    },
    info: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      emitCustomLog('INFO', request, message, context)
    },
    warn: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      emitCustomLog('WARNING', request, message, context)
    }
  }

  const createRequestScopedLogger = (
    request: Request
  ): RequestScopedLogger => ({
    debug: (message, context) =>
      emitCustomLog('DEBUG', request, message, context),
    error: (message, context) =>
      emitCustomLog('ERROR', request, message, context),
    info: (message, context) =>
      emitCustomLog('INFO', request, message, context),
    mergeContext: partial => contextStore.mergeContext(request, partial),
    warn: (message, context) =>
      emitCustomLog('WARNING', request, message, context)
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
      beforeTime: requestStartTimes.get(request) ?? 0n
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

  const useAsyncLocalStorage = options.config?.useAsyncLocalStorage === true

  /**
   * Restores the no-op logger once a request is over, so a promise that
   * outlives it and calls `useLogger()` writes nowhere instead of into
   * whichever request happened to run last.
   */
  const exitRequestScope = (): void => {
    if (useAsyncLocalStorage) {
      loggerStorage.enterWith(noopRequestLogger)
    }
  }

  /**
   * The timing store for the error line. When a hook after the handler throws,
   * onError runs for a request onAfterHandle already closed: its success line
   * is on the wire and cannot be retracted, but the error line still has to
   * carry the request's real duration, and closing twice would resolve tail
   * sampling twice for the same request.
   */
  const errorStore = (
    request: Request,
    setHeaders: Record<string, string | number>,
    error: unknown
  ): StoreData => {
    if (closed.has(request)) {
      return { beforeTime: requestStartTimes.get(request) ?? 0n }
    }

    const store = closeRequest(request, setHeaders, errorStatus(error))
    closed.add(request)
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
    .state('beforeTime', 0n)
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
    .onStop(async () => {
      const timeoutMs =
        options.config?.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS
      const timedOut = await raceWithTimeout(flushAll(options), timeoutMs)
      // A zero timeout means the caller opted out of waiting, so the flush
      // "timing out" is expected and not worth reporting.
      if (timedOut && timeoutMs > 0) {
        reportShutdownTimeout(options.config?.onError, timeoutMs)
      }
    })
    .onRequest(({ request, store }) => {
      const beforeTime = process.hrtime.bigint()
      requestStartTimes.set(request, beforeTime)
      // Published for handlers that read `store.beforeTime`. The plugin's own
      // timing comes from the per-request map above, since Elysia's store is
      // app-global and concurrent requests share this slot.
      store.beforeTime = beforeTime
      logger.beginRequest(request)
      if (requestIdConfig) {
        const requestId = getOrCreateRequestId(request, requestIdConfig)
        contextStore.mergeContext(request, { requestId })
      }

      if (enrichers) {
        applyRequestEnrichers(enrichers, contextStore, request, onSinkError)
      }

      if (useAsyncLocalStorage) {
        loggerStorage.enterWith(createRequestScopedLogger(request))
      }
    })
    .onAfterHandle(({ request, set, response }) => {
      try {
        if (closed.has(request)) {
          return
        }

        const status = resolveHandledStatus(set.status, response)

        // Runs before the early return: a request that only emitted custom
        // logs still needs its buffered records replayed.
        const store = closeRequest(
          request,
          set.headers,
          status,
          response instanceof Response ? response.headers : undefined
        )
        closed.add(request)

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
        // Nothing else is cleaned up here: the timings and the context bag
        // live in WeakMaps keyed by the request, and a hook running after this
        // one may still throw, in which case onError needs both to stay
        // truthful.
      } finally {
        exitRequestScope()
      }
    })
    .onError(({ request, error, set }) => {
      try {
        logger.handleHttpError(
          request,
          error,
          errorStore(request, set.headers, error)
        )
      } finally {
        requestStartTimes.delete(request)
        contextStore.clearContext(request)
        exitRequestScope()
      }
    })
    .as('scoped') as Logixlysia<TFields>

  return Object.assign(plugin, { wrapWs }) as LogixlysiaPlugin<TFields>
}

/**
 * Drains every transport and file sink; with `close: true` also releases
 * them. For processes that stop without Elysia's `onStop` (workers,
 * scripts, custom signal handlers). Safe to call more than once.
 */
export const flushLogixlysia = async (
  options: Options,
  { close = false }: { close?: boolean } = {}
): Promise<void> => {
  await flushAll(options)
  if (close) {
    await Promise.allSettled([closeTransports(options), closeAllFileSinks()])
  }
}

export { resolveOptions } from './config/resolve-options'
export { useLogger } from './context/storage'
export type { HttpErrorInit, HttpErrorPayload } from './errors'
export { HttpError } from './errors'
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

export default createLogixlysiaPlugin
export const logixlysia: typeof createLogixlysiaPlugin = createLogixlysiaPlugin
