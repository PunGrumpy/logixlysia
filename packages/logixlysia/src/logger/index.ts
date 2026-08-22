import pino from 'pino'
import pretty from 'pino-pretty'
import {
  createRequestContextStore,
  type RequestContextStore
} from '../context/request-context'
import type {
  Logger,
  LogLevel,
  Options,
  Pino,
  RequestInfo,
  StoreData
} from '../interfaces'
import { resolveSampling } from '../sampling'
import { elapsedMs } from '../utils/duration'
import { buildPinoRedactPaths } from '../utils/redact'
import { createFormatContext } from './create-logger'
import { emit, parseRequestUrlOnce, resolveSinks, shouldLog } from './emit'
import { handleHttpError } from './handle-http-error'

const ZERO_STORE: StoreData = { beforeTime: BigInt(0) }

export const createLogger = (
  options: Options = {},
  pinoFactory: typeof pino = pino,
  externalContextStore?: RequestContextStore
): Logger => {
  const contextStore = externalContextStore ?? createRequestContextStore()
  const { config } = options
  // Hoisted once per logger instance: colors/format/thresholds/service don't change across
  // requests within a process lifetime (see createFormatContext's doc comment).
  const formatContext = createFormatContext(options)

  const pinoConfig = config?.pino
  const { prettyPrint, ...pinoOptions } = pinoConfig ?? {}

  const prettyPrintOptions =
    typeof prettyPrint === 'object' && prettyPrint !== null
      ? (prettyPrint as Record<string, unknown>)
      : undefined

  const enablePrettyPrint =
    prettyPrint === true || prettyPrintOptions !== undefined

  const shouldPrettyPrint =
    enablePrettyPrint && pinoOptions.transport === undefined

  const messageKey =
    (prettyPrintOptions?.messageKey as string | undefined) ??
    pinoOptions.messageKey
  const errorKey =
    (prettyPrintOptions?.errorKey as string | undefined) ?? pinoOptions.errorKey

  const basePinoOptions = {
    ...pinoOptions,
    errorKey,
    level: pinoOptions.level ?? 'info',
    messageKey,
    ...(config?.autoRedact === true && pinoOptions.redact === undefined
      ? {
          redact: {
            censor: '[REDACTED]',
            paths: buildPinoRedactPaths(config?.redactKeys)
          }
        }
      : {})
  }

  // Pino (and, when configured, its pino-pretty transform stream) is expensive to construct
  // and is only ever needed when a caller explicitly reads store.pino/logger.pino or configures
  // config.pino — the plugin's own log path writes via console.* and never touches it. Building
  // it lazily behind a stable Proxy keeps `store.pino === logger.pino` identity while deferring
  // the cost until first access.
  const prettyStream = (): ReturnType<typeof pretty> =>
    pretty({
      colorize: process.stdout?.isTTY === true,
      translateTime: config?.timestamp?.translateTime,
      ...prettyPrintOptions,
      errorKey,
      messageKey
    } as Record<string, unknown>)

  let realPino: Pino | undefined

  const getPino = (): Pino => {
    if (!realPino) {
      realPino = shouldPrettyPrint
        ? pinoFactory(basePinoOptions, prettyStream())
        : pinoFactory({
            ...basePinoOptions,
            transport: pinoOptions.transport
          })
    }
    return realPino
  }

  const lazyPino = new Proxy({} as Pino, {
    get(_target, prop) {
      const target = getPino()
      const value = (target as unknown as Record<string | symbol, unknown>)[
        prop
      ]
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value
    },
    has: (_target, prop) => prop in (getPino() as object)
  })

  // Explicit config.pino means the user opted in to pino directly: construct eagerly so
  // invalid options fail fast at plugin setup time, matching pre-lazy behavior.
  if (config?.pino !== undefined) {
    getPino()
  }

  // Resolved once per logger instance: none of these depend on per-request state.
  const sinks = resolveSinks(config)
  const sampling = resolveSampling(config?.sampling)

  const log = (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ): void => {
    emit({
      contextStore,
      data,
      formatContext,
      level,
      options,
      request,
      sampling,
      sinks,
      store
    })
  }

  /** Resolves the tail verdict and re-emits whatever it rescued. */
  const finalizeRequest = (
    request: RequestInfo,
    store: StoreData,
    status: number
  ): void => {
    if (!sampling) {
      return
    }

    const outcome = {
      durationMs: elapsedMs(store.beforeTime),
      pathname: parseRequestUrlOnce(request).pathname,
      status
    }

    for (const record of sampling.finalize(request, outcome)) {
      emit({
        bypassSampling: true,
        contextStore,
        data: record.data,
        durationOverride: record.durationMs,
        formatContext,
        level: record.level,
        options,
        request,
        sampling,
        sinks,
        // Unread on this path: `durationOverride` supplies the duration each
        // record had when it was captured.
        store: ZERO_STORE
      })
    }
  }

  const logWithContext = (
    level: LogLevel,
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ): void => {
    if (sinks.isEffectivelyDisabled || !shouldLog(level, config?.logFilter)) {
      return
    }
    const store: StoreData = { beforeTime: process.hrtime.bigint() }
    log(level, request, { context, message }, store)
  }

  return {
    beginRequest: request => {
      sampling?.begin(request)
    },
    debug: (request, message, context) => {
      logWithContext('DEBUG', request, message, context)
    },
    error: (request, message, context) => {
      logWithContext('ERROR', request, message, context)
    },
    finalizeRequest,
    getContext: request => contextStore.getContext(request),
    handleHttpError: (request, error, store) => {
      handleHttpError(
        request,
        error,
        store,
        options,
        contextStore,
        sinks,
        formatContext,
        sampling
      )
    },
    info: (request, message, context) => {
      logWithContext('INFO', request, message, context)
    },
    log,
    mergeContext: (request, partial) => {
      contextStore.mergeContext(request, partial)
    },
    pino: lazyPino,
    warn: (request, message, context) => {
      logWithContext('WARNING', request, message, context)
    }
  }
}

/** Plugin entry: shares one request-context store across the Elysia lifecycle. */
export const createPluginLogger = (
  options: Options,
  contextStore: RequestContextStore
): Logger => createLogger(options, pino, contextStore)
