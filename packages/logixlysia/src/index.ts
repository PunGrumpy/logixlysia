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
import {
  getStatusCode,
  isStatusResponse,
  levelForStatus
} from './helpers/status'
import type {
  LogFields,
  LogixlysiaStore,
  LogLevel,
  Options,
  RequestScopedLogger,
  StoreData
} from './interfaces'
import { createPluginLogger } from './logger'
import { reportFormatError, resolveSinks, shouldLog } from './logger/emit'
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
const SERVER_ERROR_STATUS = 500

/**
 * The status the client actually sees. A `status()` result carries its own
 * code. A returned `Response` keeps its own status unless that is 200, in
 * which case `set.status` applies, as in Elysia's `mergeStatus`. Otherwise
 * Elysia sends `set.status`, which stays 200 unless a handler assigned one.
 */
const resolveHandledStatus = (
  setStatus: unknown,
  response: unknown
): number => {
  if (isStatusResponse(response)) {
    return response.code
  }

  if (response instanceof Response && response.status !== DEFAULT_STATUS) {
    return response.status
  }

  if (setStatus === undefined || setStatus === null) {
    return DEFAULT_STATUS
  }

  return getStatusCode(setStatus)
}

interface RequestRecord {
  /** A custom log replaced the access line for this request. */
  customLogged: boolean
  /** The value `onError` saw, or the error a streamed body threw. */
  error?: unknown
  /** `open` until the final line is written; `streaming` while a generator body still runs. */
  phase: 'open' | 'streaming' | 'closed'
  /** Elysia pulled the stream wrapper at least once. */
  pulled: boolean
  /** The live `set.headers` of the request, for the response enrichers. */
  setHeaders?: Record<string, string | number>
  startedAt: bigint
  /** The status the client got, recorded by the wrap for a stream still running. */
  status?: number
  /** The wrap saw this request. Otherwise the hooks close it, as before the wrap existed. */
  wrapped: boolean
}

const records = new WeakMap<Request, RequestRecord>()

const openRecord = (request: Request): RequestRecord => {
  const existing = records.get(request)
  if (existing) {
    return existing
  }
  const record: RequestRecord = {
    customLogged: false,
    phase: 'open',
    pulled: false,
    startedAt: process.hrtime.bigint(),
    wrapped: false
  }
  records.set(request, record)
  return record
}

const responseStatus = (response: unknown): number =>
  response instanceof Response ? response.status : DEFAULT_STATUS

const isGeneratorObject = (
  value: unknown
): value is AsyncIterable<unknown> | Iterable<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { next?: unknown }).next === 'function' &&
  (Symbol.asyncIterator in value || Symbol.iterator in value)

/**
 * Elysia uses a `ReadableStream` yielded first as the whole body and never
 * pulls the generator again. A `Response` yielded anywhere, or a stream
 * yielded later, is encoded like any other chunk. Only the first value can
 * take the response over.
 */
const takesOverResponse = (first: unknown): boolean =>
  first instanceof ReadableStream

/**
 * Pulls a handler's generator, inside the request's logger scope when
 * `useAsyncLocalStorage` is on. Elysia pulls every value after the first
 * from a ReadableStream `pull`, which Bun 1.3.14 runs in the context of
 * whoever reads the body rather than the one the wrap entered, so the
 * body would otherwise lose `useLogger()` after its first `yield`.
 */
type RunInScope = <T>(pull: () => T) => T

const runUnscoped: RunInScope = pull => pull()

const runInLoggerScope =
  (logger: RequestScopedLogger): RunInScope =>
  pull =>
    loggerStorage.run(logger, pull)

const wrapAsyncStream = async function* wrapAsyncStream(
  record: RequestRecord,
  source: AsyncIterable<unknown>,
  runInScope: RunInScope,
  onSettled: () => void
): AsyncGenerator<unknown, unknown> {
  record.pulled = true
  const iterator = source[Symbol.asyncIterator]()
  const scoped: AsyncIterator<unknown> = {
    next: (...args) => runInScope(() => iterator.next(...args)),
    return: iterator.return?.bind(iterator),
    throw: iterator.throw?.bind(iterator)
  }
  try {
    const first = await scoped.next()
    if (first.done) {
      return first.value
    }
    if (takesOverResponse(first.value)) {
      record.phase = 'open'
    }
    yield first.value
    // Delegation forwards every later value, the return value, and the
    // `return()` of a cancelled body to the source.
    return yield* { [Symbol.asyncIterator]: () => scoped }
  } catch (error) {
    record.error = error
    throw error
  } finally {
    // A body cancelled before its first read parks this generator at the
    // `yield` above, outside the delegation, so forward the cancel by hand
    // (a no-op on a source that already finished). The request settles even
    // when the source's own cleanup throws.
    try {
      await iterator.return?.()
    } finally {
      onSettled()
    }
  }
}

const wrapSyncStream = function* wrapSyncStream(
  record: RequestRecord,
  source: Iterable<unknown>,
  runInScope: RunInScope,
  onSettled: () => void
): Generator<unknown, unknown> {
  record.pulled = true
  const iterator = source[Symbol.iterator]()
  const scoped: Iterator<unknown> = {
    next: (...args) => runInScope(() => iterator.next(...args)),
    return: iterator.return?.bind(iterator),
    throw: iterator.throw?.bind(iterator)
  }
  try {
    const first = scoped.next()
    if (first.done) {
      return first.value
    }
    if (takesOverResponse(first.value)) {
      record.phase = 'open'
    }
    yield first.value
    return yield* { [Symbol.iterator]: () => scoped }
  } catch (error) {
    record.error = error
    throw error
  } finally {
    try {
      iterator.return?.()
    } finally {
      onSettled()
    }
  }
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
  if (responseHeaders) {
    for (const [key, value] of responseHeaders) {
      merged[key] = value
    }
  }
  return Object.assign(merged, setHeaders)
}

/**
 * @template TFields - Field bag for the request-scoped `log`. Supply your own
 * interface to have TypeScript reject misspelled context keys; the default
 * allows any key, so untyped usage is unchanged.
 */
const createLogixlysiaPlugin = <TFields extends object = LogFields>(
  rawOptions: Options = {}
): LogixlysiaPlugin<TFields> => {
  const options = resolveOptions(rawOptions)
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

    const record = openRecord(request)
    record.customLogged = true
    baseLogger.log(
      level,
      request,
      { context, message },
      { beforeTime: record.startedAt }
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
   * Everything the exits share once the status is known: echo the request id,
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
      beforeTime: records.get(request)?.startedAt ?? 0n
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

  const emitAccessLine = (
    request: Request,
    status: number,
    store: StoreData
  ): void => {
    const accumulated = contextStore.getContext(request)
    const data: Record<string, unknown> = { status }
    if (Object.keys(accumulated).length > 0) {
      data.context = { ...accumulated }
    }

    logger.log(levelForStatus(status), request, data, store)
  }

  /**
   * The final line for a request whose response Elysia has produced. Runs
   * once, with the status the client got. A request whose body is still
   * streaming is finished by the stream wrapper instead. A thrown value that
   * is not Elysia's own status() result is an error whatever the status the
   * client got (a later onError may have mapped it to a 3xx, or a streamed
   * body may have failed after a 200 went out); a thrown status() result is
   * an error only when its code says so.
   */
  const finishRequest = (
    request: Request,
    record: RequestRecord,
    status: number,
    responseHeaders?: Headers
  ): void => {
    if (record.phase === 'closed') {
      return
    }
    record.phase = 'closed'
    try {
      const store = closeRequest(
        request,
        record.setHeaders ?? {},
        status,
        responseHeaders
      )
      if (
        record.error !== undefined &&
        (status >= 400 || !isStatusResponse(record.error))
      ) {
        logger.handleHttpError(request, record.error, { ...store, status })
      } else if (!record.customLogged) {
        emitAccessLine(request, status, store)
      }
    } catch (failure) {
      reportFormatError(failure, onSinkError)
    }
  }

  /**
   * Called from a stream wrapper's `finally`. A body the wrap already saw the
   * response for is finished here with that status. A body that ended,
   * failed or handed Elysia a whole response before the response existed
   * goes back to `open`, so the wrap writes the line with the real status.
   */
  const settleStream = (request: Request, record: RequestRecord): void => {
    if (record.phase !== 'streaming') {
      return
    }
    if (record.status === undefined) {
      record.phase = 'open'
      return
    }
    finishRequest(request, record, record.status)
  }

  const wrapStream = (
    request: Request,
    record: RequestRecord,
    response: unknown
  ): unknown => {
    if (!isGeneratorObject(response)) {
      return
    }
    record.phase = 'streaming'
    const onSettled = (): void => settleStream(request, record)
    const runInScope = useAsyncLocalStorage
      ? runInLoggerScope(createRequestScopedLogger(request))
      : runUnscoped
    const wrapper =
      Symbol.asyncIterator in response
        ? wrapAsyncStream(record, response, runInScope, onSettled)
        : wrapSyncStream(record, response, runInScope, onSettled)
    // Elysia reads markers off the generator object itself: `sse(generator)`
    // sets the one that selects event-stream framing.
    return Object.assign(wrapper, response)
  }

  /**
   * Closes a request the wrap did not see: Elysia skips higher-order
   * functions with `aot: false`, and `group()` and `guard()` do not merge
   * them into the parent. The hooks then write the line, as before.
   */
  const finishUnwrapped = (
    request: Request,
    record: RequestRecord,
    status: number,
    responseHeaders?: Headers
  ): void => {
    finishRequest(request, record, status, responseHeaders)
    exitRequestScope()
  }

  const wrapFetch =
    (fetch: (request: Request, server: unknown) => unknown) =>
    (request: Request, server: unknown): unknown => {
      const record = openRecord(request)
      record.wrapped = true
      const settle = async (): Promise<unknown> => {
        let response: unknown
        try {
          response = await fetch(request, server)
        } catch (error) {
          // Elysia rejects when mapping an error throws again (a cookie it
          // cannot serialize, say), and the server then answers 500.
          record.error ??= error
          finishRequest(request, record, SERVER_ERROR_STATUS)
          throw error
        }
        if (
          record.phase === 'streaming' &&
          record.pulled &&
          record.error === undefined
        ) {
          // The body is still being produced; the stream wrapper finishes it.
          // A recorded error means Elysia failed to build the stream after
          // its first pull and answered with an error response instead.
          record.status = responseStatus(response)
          return response
        }
        finishRequest(
          request,
          record,
          responseStatus(response),
          response instanceof Response ? response.headers : undefined
        )
        return response
      }
      return useAsyncLocalStorage
        ? loggerStorage.run(createRequestScopedLogger(request), settle)
        : settle()
    }

  const app = new Elysia({
    detail: {
      description:
        'Logixlysia is a plugin for Elysia that provides a logger and pino logger.',
      tags: ['logging', 'pino']
    },
    name: 'Logixlysia'
  }).wrap(wrapFetch)

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
    .onRequest(({ request, set, store }) => {
      const record = openRecord(request)
      record.setHeaders = set.headers
      store.beforeTime = record.startedAt
      logger.beginRequest(request)
      if (requestIdConfig) {
        const requestId = getOrCreateRequestId(request, requestIdConfig)
        contextStore.mergeContext(request, { requestId })
        // Written now, not when the line is written: the wrap runs after
        // the Response exists, and a short-circuit never reaches the hooks.
        set.headers[requestIdConfig.header] = requestId
      }

      if (enrichers) {
        applyRequestEnrichers(enrichers, contextStore, request, onSinkError)
      }

      // The wrap scopes the logger for the requests it sees; the rest keep
      // the hook-scoped logger of the previous design.
      if (useAsyncLocalStorage && !record.wrapped) {
        loggerStorage.enterWith(createRequestScopedLogger(request))
      }
    })
    .onAfterHandle(({ request, set, response }) => {
      const record = openRecord(request)
      if (!record.wrapped) {
        finishUnwrapped(
          request,
          record,
          resolveHandledStatus(set.status, response),
          response instanceof Response ? response.headers : undefined
        )
        return
      }
      const wrapped = wrapStream(request, record, response)
      if (wrapped !== undefined) {
        return wrapped
      }
    })
    .onError(({ request, error }) => {
      const record = openRecord(request)
      record.error = error
      if (record.wrapped) {
        return
      }
      if (record.phase === 'closed') {
        // Thrown after the line was written (a route afterHandle, a response
        // schema): a second, error line, as before the wrap existed.
        logger.handleHttpError(request, error, { beforeTime: record.startedAt })
        exitRequestScope()
        return
      }
      finishUnwrapped(request, record, errorStatus(error))
    })
    .onAfterResponse(context => {
      const { request, set } = context
      const record = openRecord(request)
      if (record.wrapped) {
        return
      }
      // An exit that reached neither hook above (a resolve short-circuit, a
      // 404, an error an earlier app-wide onError answered).
      const error = 'error' in context ? context.error : undefined
      if (error !== undefined) {
        record.error = error
      }
      finishUnwrapped(request, record, getStatusCode(set.status))
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
