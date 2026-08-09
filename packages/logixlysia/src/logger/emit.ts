import {
  mergeLogDataContext,
  type RequestContextStore
} from '../context/request-context'
import type {
  LogFilter,
  LogLevel,
  Options,
  RequestInfo,
  StoreData
} from '../interfaces'
import { logToTransports } from '../output'
import { logToFile } from '../output/file'
import { redact, redactRequest } from '../utils/redact'
import {
  type FormatContext,
  formatLogOutput,
  type PrecomputedLogParts
} from './create-logger'

/**
 * Which sinks are active for a given config, resolved once per logger
 * instance (see `createLogger`) since none of these depend on per-request
 * state.
 */
export interface Sinks {
  hasFileLogging: boolean
  hasInternalLogger: boolean
  hasTransports: boolean
  /** True when no sink is active at all: `log()`/`handleHttpError()` can skip all work. */
  isEffectivelyDisabled: boolean
  /** True when at least one active sink reads pathname/search (file logging or the console formatter). */
  needsUrlParts: boolean
}

export const resolveSinks = (config: Options['config']): Sinks => {
  const useTransportsOnly = config?.useTransportsOnly === true
  const disableInternalLogger = config?.disableInternalLogger === true
  const disableFileLogging = config?.disableFileLogging === true

  const hasTransports = (config?.transports?.length ?? 0) > 0
  const hasFileLogging =
    !(useTransportsOnly || disableFileLogging) && !!config?.logFilePath
  const hasInternalLogger = !(useTransportsOnly || disableInternalLogger)
  const isEffectivelyDisabled = !(
    hasTransports ||
    hasFileLogging ||
    hasInternalLogger
  )
  const needsUrlParts = hasFileLogging || hasInternalLogger

  return {
    hasFileLogging,
    hasInternalLogger,
    hasTransports,
    isEffectivelyDisabled,
    needsUrlParts
  }
}

export const shouldLog = (level: LogLevel, logFilter?: LogFilter): boolean => {
  if (!logFilter?.level || logFilter.level.length === 0) {
    return true
  }
  return logFilter.level.includes(level)
}

const computeDurationMs = (store: StoreData): number =>
  store.beforeTime === BigInt(0)
    ? 0
    : Number(process.hrtime.bigint() - store.beforeTime) / 1_000_000

/** Parses the URL once; only called when at least one active sink reads pathname/search. */
const parseRequestUrlOnce = (
  request: RequestInfo
): { pathname: string; search: string } => {
  try {
    const { pathname, search } = new URL(request.url)
    return { pathname, search }
  } catch {
    return { pathname: request.url || '/', search: '' }
  }
}

/**
 * Samples duration and parses the URL once per emission for the sinks that will actually run.
 * `logToTransports`' meta only reads `durationMs` (not pathname/search), so the URL is parsed
 * only when file logging or the internal console logger is active — skipping it entirely for
 * transports-only configs, matching that path's pre-optimization behavior.
 */
export const computePrecomputedLogParts = (
  store: StoreData,
  request: RequestInfo,
  needsUrlParts: boolean
): PrecomputedLogParts => {
  const durationMs = computeDurationMs(store)
  const { pathname, search } = needsUrlParts
    ? parseRequestUrlOnce(request)
    : { pathname: '', search: '' }

  return { durationMs, pathname, search }
}

const consoleForLevel = (level: LogLevel): typeof console.log => {
  switch (level) {
    case 'DEBUG': {
      return console.debug
    }
    case 'INFO': {
      return console.info
    }
    case 'WARNING': {
      return console.warn
    }
    case 'ERROR': {
      return console.error
    }
    default: {
      return console.log
    }
  }
}

export interface EmitInput {
  /** Shared per-request context bag (peeked, never cloned/retained). */
  contextStore: RequestContextStore
  data: Record<string, unknown>
  /** Hoisted per-logger constants for `formatLogOutput`; only read when the internal console logger is active. */
  formatContext: FormatContext
  level: LogLevel
  options: Options
  request: RequestInfo
  /** Hoisted per-logger sink gates from {@link resolveSinks}. */
  sinks: Sinks
  store: StoreData
}

/**
 * The single log-emission pipeline shared by the success path (`log()`) and
 * the error path (`handleHttpError()`): filter check -> context merge ->
 * redact -> transports -> file -> console, all gated by the same `sinks`.
 */
export const emit = ({
  contextStore,
  data,
  formatContext,
  level,
  options,
  request,
  sinks,
  store
}: EmitInput): void => {
  const { config } = options

  if (sinks.isEffectivelyDisabled || !shouldLog(level, config?.logFilter)) {
    return
  }

  const dataWithContext = mergeLogDataContext(
    data,
    // mergeLogDataContext only reads/spreads this bag into a new object; it never retains
    // the reference, so a non-cloning peek is safe here.
    contextStore.peekContext(request)
  )
  const logData =
    config?.autoRedact === true
      ? redact(dataWithContext, config?.redactKeys)
      : dataWithContext
  const logRequest =
    config?.autoRedact === true
      ? redactRequest(request, config?.redactKeys)
      : request

  const precomputed = computePrecomputedLogParts(
    store,
    logRequest,
    sinks.needsUrlParts
  )

  if (sinks.hasTransports) {
    logToTransports({
      data: logData,
      level,
      options,
      precomputed,
      request: logRequest,
      store
    })
  }

  if (sinks.hasFileLogging) {
    const filePath = config?.logFilePath
    if (filePath) {
      logToFile({
        data: logData,
        filePath,
        level,
        options,
        precomputed,
        request: logRequest,
        store
      }).catch(() => {
        /* Ignore errors: file.ts already reported them (console.error or config.onError). */
      })
    }
  }

  if (!sinks.hasInternalLogger) {
    return
  }

  const { main, contextLines } = formatLogOutput({
    data: logData,
    formatContext,
    level,
    options,
    precomputed,
    request: logRequest,
    store
  })
  const message =
    contextLines.length > 0 ? `${main}\n${contextLines.join('\n')}` : main

  consoleForLevel(level)(message)
}
