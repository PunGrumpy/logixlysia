import { isLogLevel } from '../helpers/level'
import type {
  LogFilter,
  LogPreset,
  Options,
  SamplingConfig
} from '../interfaces'
import { requestIdHeaderName } from '../middleware/request-id'
import { parseInterval, parseRetention, parseSize } from '../utils/rotation'

const VALID_PRESETS: ReadonlySet<LogPreset> = new Set(['dev', 'prod', 'json'])

const validateLogRotation = (config: Options['config']): void => {
  const logRotation = config?.logRotation
  if (!logRotation) {
    return
  }

  try {
    if (logRotation.maxSize !== undefined) {
      parseSize(logRotation.maxSize)
    }
    if (logRotation.maxFiles !== undefined) {
      parseRetention(logRotation.maxFiles)
    }
    if (logRotation.interval !== undefined) {
      parseInterval(logRotation.interval)
    }
    if (
      logRotation.compression !== undefined &&
      logRotation.compression !== 'gzip'
    ) {
      throw new Error(
        `Invalid compression algorithm: ${logRotation.compression}`
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`logixlysia: invalid logRotation config — ${message}`, {
      cause: error
    })
  }
}

const MAX_SAMPLING_RATE = 100

const isPercentage = (value: unknown): boolean =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_SAMPLING_RATE

const isNonNegativeNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/** The largest delay `setTimeout` honours; above it the timer fires after 1 ms. */
const MAX_TIMER_DELAY_MS = 2_147_483_647

const invalidSampling = (detail: string): never => {
  throw new Error(`logixlysia: invalid sampling config — ${detail}`)
}

const invalidFormatting = (detail: string): never => {
  throw new Error(`logixlysia: invalid formatting config — ${detail}`)
}

const invalidLogFilter = (detail: string): never => {
  throw new Error(`logixlysia: invalid logFilter config — ${detail}`)
}

const invalidOutput = (detail: string): never => {
  throw new Error(`logixlysia: invalid output config — ${detail}`)
}

const validateTailSampling = (tail: SamplingConfig['tail']): void => {
  if (tail?.status !== undefined && !isNonNegativeNumber(tail.status)) {
    invalidSampling('tail.status must be a non-negative number')
  }
  if (tail?.durationMs !== undefined && !isNonNegativeNumber(tail.durationMs)) {
    invalidSampling('tail.durationMs must be a non-negative number')
  }
  if (tail?.keep !== undefined && typeof tail.keep !== 'function') {
    invalidSampling('tail.keep must be a function')
  }
  if (tail?.paths !== undefined) {
    if (!Array.isArray(tail.paths)) {
      invalidSampling('tail.paths must be an array')
    }
    if (
      tail.paths.some(path => typeof path !== 'string' || path.length === 0)
    ) {
      invalidSampling('tail.paths must contain non-empty glob strings')
    }
  }
}

const validateSampling = (config: Options['config']): void => {
  const sampling = config?.sampling
  if (!sampling) {
    return
  }

  for (const [level, rate] of Object.entries(sampling.head ?? {})) {
    if (!isLogLevel(level)) {
      invalidSampling(
        `head.${level} is not a valid level (must be DEBUG, INFO, WARNING, or ERROR)`
      )
    }
    if (!isPercentage(rate)) {
      invalidSampling(`head.${level} must be a number between 0 and 100`)
    }
  }

  validateTailSampling(sampling.tail)

  const { maxBufferedPerRequest } = sampling
  if (
    maxBufferedPerRequest !== undefined &&
    !(Number.isInteger(maxBufferedPerRequest) && maxBufferedPerRequest >= 0)
  ) {
    invalidSampling('maxBufferedPerRequest must be a non-negative integer')
  }
}

const validateFormatting = (config: Options['config']): void => {
  const consoleFormat: unknown = config?.consoleFormat
  if (
    consoleFormat !== undefined &&
    consoleFormat !== 'json' &&
    consoleFormat !== 'text'
  ) {
    invalidFormatting(
      `consoleFormat must be 'json' or 'text', got ${JSON.stringify(consoleFormat)}`
    )
  }

  const slowThreshold = config?.slowThreshold
  const verySlowThreshold = config?.verySlowThreshold

  if (slowThreshold !== undefined && !isNonNegativeNumber(slowThreshold)) {
    invalidFormatting(
      `slowThreshold must be a finite non-negative number, got ${slowThreshold}`
    )
  }
  if (
    verySlowThreshold !== undefined &&
    !isNonNegativeNumber(verySlowThreshold)
  ) {
    invalidFormatting(
      `verySlowThreshold must be a finite non-negative number, got ${verySlowThreshold}`
    )
  }
  if (
    slowThreshold !== undefined &&
    verySlowThreshold !== undefined &&
    slowThreshold > verySlowThreshold
  ) {
    invalidFormatting(
      `slowThreshold (${slowThreshold}) must not exceed verySlowThreshold (${verySlowThreshold})`
    )
  }
}

const validateLogFilterLevel = (level: unknown): void => {
  if (level === undefined) {
    return
  }

  const isKnownLevelList = Array.isArray(level) && level.every(isLogLevel)
  if (!isKnownLevelList) {
    invalidLogFilter(
      `level must be an array of DEBUG, INFO, WARNING or ERROR, got ${JSON.stringify(level)}`
    )
  }
}

const isGlobList = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(entry => typeof entry === 'string' && entry.length > 0)

const validateAccessLineGlobs = (accessLine: LogFilter['accessLine']): void => {
  for (const key of ['include', 'exclude'] as const) {
    const globs: unknown = accessLine?.[key]
    if (globs !== undefined && !isGlobList(globs)) {
      invalidLogFilter(
        `accessLine.${key} must be an array of non-empty glob strings`
      )
    }
  }
}

const validateLogFilter = (config: Options['config']): void => {
  validateLogFilterLevel(config?.logFilter?.level)
  validateAccessLineGlobs(config?.logFilter?.accessLine)
}

const validateOutput = (config: Options['config']): void => {
  if (
    config?.useTransportsOnly === true &&
    (config.transports?.length ?? 0) === 0
  ) {
    invalidOutput(
      'useTransportsOnly is set but transports is empty; add a transport or remove useTransportsOnly'
    )
  }

  const flushTimeoutMs = config?.flushTimeoutMs
  if (
    flushTimeoutMs !== undefined &&
    !(
      isNonNegativeNumber(flushTimeoutMs) &&
      flushTimeoutMs <= MAX_TIMER_DELAY_MS
    )
  ) {
    invalidOutput(
      `flushTimeoutMs must be a finite number of milliseconds between 0 and ${MAX_TIMER_DELAY_MS}, got ${flushTimeoutMs}`
    )
  }
}

/** RFC 9110 `token`: the characters a header field name may contain. */
const HEADER_NAME_REGEX = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u

const validateRequestId = (config: Options['config']): void => {
  const requestId = config?.requestId
  if (
    typeof requestId !== 'object' ||
    requestId === null ||
    requestId.header === undefined
  ) {
    return
  }
  const raw: unknown = requestId.header
  if (
    typeof raw !== 'string' ||
    !HEADER_NAME_REGEX.test(requestIdHeaderName(raw))
  ) {
    throw new Error(
      `logixlysia: invalid requestId config — header must be a valid HTTP header name, got ${JSON.stringify(raw)}`
    )
  }
}

const REDACT_PATTERNS_ERROR = 'logixlysia: invalid redactPatterns —'

/** Short texts a pattern is tried on, for an empty match that may need context (`\b`, a lookahead). */
const EMPTY_MATCH_SAMPLES = ['', 'a b'] as const

const toGlobalPattern = (entry: unknown): RegExp => {
  if (!(entry instanceof RegExp)) {
    throw new TypeError(
      `${REDACT_PATTERNS_ERROR} expected a RegExp, got ${typeof entry}`
    )
  }
  const flags = entry.flags.replaceAll('g', '').replaceAll('y', '')
  const pattern = new RegExp(entry.source, `${flags}g`)
  const canMatchNothing = EMPTY_MATCH_SAMPLES.some(sample =>
    [...sample.matchAll(pattern)].some(([match]) => match === '')
  )
  if (canMatchNothing) {
    throw new Error(
      `${REDACT_PATTERNS_ERROR} ${entry.source} can match nothing`
    )
  }
  return pattern
}

/**
 * `replaceAll` throws on a non-global pattern and a sticky one silently
 * matches nothing, which would leak, so every pattern is rebuilt global and
 * non-sticky. Idempotent: a normalized pattern comes back with the same flags.
 */
const normalizeRedactPatterns = (options: Options): Options => {
  const patterns: unknown = options.config?.redactPatterns
  if (patterns === undefined) {
    return options
  }
  if (!Array.isArray(patterns)) {
    throw new TypeError(
      `${REDACT_PATTERNS_ERROR} expected an array of RegExp, got ${typeof patterns}`
    )
  }
  if (patterns.length === 0) {
    return options
  }
  if (options.config?.autoRedact !== true) {
    throw new Error(`${REDACT_PATTERNS_ERROR} needs autoRedact: true`)
  }
  return {
    ...options,
    config: { ...options.config, redactPatterns: patterns.map(toGlobalPattern) }
  }
}

const PRESET_DEFAULTS: Record<LogPreset, NonNullable<Options['config']>> = {
  dev: {
    pino: {
      prettyPrint: true
    },
    showContextTree: true,
    showStartupMessage: true,
    startupMessageFormat: 'banner',
    useColors: true
  },
  json: {
    consoleFormat: 'json',
    pino: {
      prettyPrint: false
    },
    showContextTree: false,
    showStartupMessage: false,
    useColors: false
  },
  prod: {
    autoRedact: true,
    consoleFormat: 'json',
    pino: {
      prettyPrint: false
    },
    requestId: true,
    showContextTree: false,
    showStartupMessage: false,
    useColors: false
  }
}

const mergeConfig = (
  base: NonNullable<Options['config']>,
  override?: Options['config']
): NonNullable<Options['config']> => {
  if (!override) {
    return base
  }

  const defined = Object.fromEntries(
    Object.entries(override).filter(([, value]) => value !== undefined)
  ) as NonNullable<Options['config']>
  const merged: NonNullable<Options['config']> = { ...base, ...defined }

  if (base.pino || override.pino) {
    merged.pino = {
      ...base.pino,
      ...override.pino,
      ...(base.pino?.prettyPrint !== undefined ||
      override.pino?.prettyPrint !== undefined
        ? {
            prettyPrint: override.pino?.prettyPrint ?? base.pino?.prettyPrint
          }
        : {})
    }
  }

  return merged
}

/** Applies preset defaults; explicit `config` keys override preset values. */
export const resolveOptions = (options: Options = {}): Options => {
  const { preset } = options
  if (preset && !VALID_PRESETS.has(preset)) {
    throw new Error(`logixlysia: invalid preset — ${preset}`)
  }

  const resolved = preset
    ? {
        ...options,
        config: mergeConfig(PRESET_DEFAULTS[preset], options.config)
      }
    : options

  validateLogRotation(resolved.config)
  validateSampling(resolved.config)
  validateFormatting(resolved.config)
  validateLogFilter(resolved.config)
  validateOutput(resolved.config)
  validateRequestId(resolved.config)
  return normalizeRedactPatterns(resolved)
}
