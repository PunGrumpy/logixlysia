import pino from 'pino'
import pretty from 'pino-pretty'
import { resolveOptions } from '../config/resolve-options'
import { createRequestContextStore } from '../context/request-context'
import type { RequestContextStore } from '../context/request-context'
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
import { emit, isSuppressed, parseRequestUrlOnce, resolveSinks } from './emit'
import type { EmitOutcome } from './emit'
import { handleHttpError } from './handle-http-error'

const ZERO_STORE: StoreData = { beforeTime: 0n }

const createLazyPino = (
  config: Options['config'],
  pinoFactory: typeof pino
): Pino => {
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
  // Only pass keys that are set: an explicit `undefined` overrides pino's
  // `msg`/`err` defaults and writes messages under an "undefined" key.
  const outputKeys = {
    ...(errorKey === undefined ? {} : { errorKey }),
    ...(messageKey === undefined ? {} : { messageKey })
  }

  const basePinoOptions = {
    ...pinoOptions,
    ...outputKeys,
    level: pinoOptions.level ?? 'info',
    ...(config?.autoRedact === true && pinoOptions.redact === undefined
      ? {
          redact: {
            censor: '[REDACTED]',
            paths: buildPinoRedactPaths(config?.redactKeys)
          }
        }
      : {})
  }

  const prettyStream = (): ReturnType<typeof pretty> =>
    pretty({
      colorize: process.stdout?.isTTY === true,
      translateTime: config?.timestamp?.translateTime,
      ...prettyPrintOptions,
      ...outputKeys
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

  // Elysia's `state()` ignores an object with no own enumerable keys, so the
  // target carries one; the traps below forward everything to the real pino
  // once it exists and never construct it just to enumerate.
  const target = { level: undefined } as unknown as Pino
  const lazyPino = new Proxy(target, {
    get(_target, prop) {
      const real = getPino()
      const value = (real as unknown as Record<string | symbol, unknown>)[prop]
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(real)
        : value
    },
    getOwnPropertyDescriptor: (base, prop) =>
      Object.getOwnPropertyDescriptor(realPino ?? base, prop),
    has: (_target, prop) => prop in (getPino() as object),
    ownKeys: base => Reflect.ownKeys(realPino ?? base),
    set(_target, prop, value) {
      ;(getPino() as unknown as Record<string | symbol, unknown>)[prop] = value
      return true
    }
  })

  if (config?.pino !== undefined) {
    getPino()
  }

  return lazyPino
}

/** The logger the plugin builds on: it also learns what sampling did. */
export interface PluginLogger extends Logger {
  /** Returns the number of buffered records the tail verdict replayed. */
  finalizeRequest: (
    request: RequestInfo,
    store: StoreData,
    status: number
  ) => number
  log: (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ) => EmitOutcome
}

const buildLogger = (
  options: Options,
  pinoFactory: typeof pino,
  externalContextStore?: RequestContextStore
): PluginLogger => {
  const contextStore = externalContextStore ?? createRequestContextStore()
  const { config } = options
  const formatContext = createFormatContext(options)

  const lazyPino = createLazyPino(config, pinoFactory)

  const sinks = resolveSinks(config)
  const sampling = resolveSampling(config?.sampling)

  const log = (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ): EmitOutcome =>
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

  const finalizeRequest = (
    request: RequestInfo,
    store: StoreData,
    status: number
  ): number => {
    if (!sampling) {
      return 0
    }

    const outcome = {
      durationMs: elapsedMs(store.beforeTime),
      pathname: parseRequestUrlOnce(request).pathname,
      status
    }

    const replayed = sampling.finalize(request, outcome)
    for (const record of replayed) {
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
    return replayed.length
  }

  const logWithContext = (
    level: LogLevel,
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ): void => {
    if (isSuppressed(sinks, level, config?.logFilter)) {
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

/** Applies the preset and validates `options`, as the plugin does. */
export const createLogger = (
  options: Options = {},
  pinoFactory: typeof pino = pino,
  externalContextStore?: RequestContextStore
): Logger =>
  buildLogger(resolveOptions(options), pinoFactory, externalContextStore)

/**
 * Plugin entry: shares one request-context store across the Elysia lifecycle.
 * Takes options the plugin has already passed through `resolveOptions`.
 */
export const createPluginLogger = (
  options: Options,
  contextStore: RequestContextStore
): PluginLogger => buildLogger(options, pino, contextStore)
