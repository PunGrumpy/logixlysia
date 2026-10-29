import { mergeLogDataContext } from '../context/request-context'
import type { RequestContextStore } from '../context/request-context'
import type {
  LogFilter,
  LogLevel,
  Options,
  RequestInfo,
  StoreData
} from '../interfaces'
import { logToTransports } from '../output'
import { logToFile } from '../output/file'
import type { SamplingRuntime } from '../sampling'
import { elapsedMs } from '../utils/duration'
import { redact, redactRequest } from '../utils/redact'
import { createErrorReporter } from '../utils/report'
import type { ErrorReporter } from '../utils/report'
import { settle } from '../utils/settle'
import { formatLogOutput } from './create-logger'
import type { FormatContext, PrecomputedLogParts } from './create-logger'

export interface Sinks {
  hasFileLogging: boolean
  hasInternalLogger: boolean
  hasTransports: boolean
  isEffectivelyDisabled: boolean
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

export const isSuppressed = (
  sinks: Sinks,
  level: LogLevel,
  logFilter?: LogFilter
): boolean => sinks.isEffectivelyDisabled || !shouldLog(level, logFilter)

export const parseRequestUrlOnce = (
  request: RequestInfo
): { pathname: string; search: string } => {
  try {
    const { pathname, search } = new URL(request.url)
    return { pathname, search }
  } catch {
    return { pathname: request.url || '/', search: '' }
  }
}

export const computePrecomputedLogParts = (
  store: StoreData,
  request: RequestInfo,
  needsUrlParts: boolean,
  durationOverride?: number
): PrecomputedLogParts => {
  const durationMs = durationOverride ?? elapsedMs(store.beforeTime)
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
  bypassSampling?: boolean
  contextStore: RequestContextStore
  data: Record<string, unknown>
  durationOverride?: number
  formatContext: FormatContext
  level: LogLevel
  options: Options
  request: RequestInfo
  sampling?: SamplingRuntime
  sinks: Sinks
  store: StoreData
}

/** What became of a record: written now, held for the tail verdict, or neither. */
export type EmitOutcome = 'buffered' | 'dropped' | 'written'

export const reportFormatError: ErrorReporter = createErrorReporter(
  'format',
  'failed to build a log record'
)

const writeRecord = ({
  contextStore,
  data,
  durationOverride,
  formatContext,
  level,
  options,
  request,
  sinks,
  store
}: EmitInput): void => {
  const { config } = options

  const dataWithContext = mergeLogDataContext(
    data,
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
    sinks.needsUrlParts,
    durationOverride
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
      settle(
        logToFile({
          data: logData,
          filePath,
          level,
          options,
          precomputed,
          request: logRequest,
          store
        })
      )
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

export const emit = (input: EmitInput): EmitOutcome => {
  const {
    bypassSampling,
    data,
    level,
    options,
    request,
    sampling,
    sinks,
    store
  } = input
  const { config } = options

  if (isSuppressed(sinks, level, config?.logFilter)) {
    return 'dropped'
  }

  if (sampling && !bypassSampling) {
    const decision = sampling.decide(level, request)
    if (decision === 'drop') {
      return 'dropped'
    }
    if (decision === 'buffer') {
      sampling.buffer(request, {
        data,
        durationMs: elapsedMs(store.beforeTime),
        level
      })
      return 'buffered'
    }
  }

  try {
    writeRecord(input)
  } catch (error) {
    reportFormatError(error, config?.onError)
  }
  return 'written'
}
