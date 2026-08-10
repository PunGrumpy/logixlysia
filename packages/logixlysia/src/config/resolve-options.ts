import type { LogPreset, Options } from '../interfaces'
import { parseInterval, parseRetention, parseSize } from '../utils/rotation'

const VALID_PRESETS: readonly LogPreset[] = ['dev', 'prod', 'json']

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
    pino: {
      prettyPrint: false
    },
    showContextTree: false,
    showStartupMessage: false,
    useColors: false
  },
  prod: {
    autoRedact: true,
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

  const merged: NonNullable<Options['config']> = { ...base, ...override }

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

  if (base.logFilter || override.logFilter) {
    merged.logFilter = {
      ...base.logFilter,
      ...override.logFilter
    }
  }

  if (base.logRotation || override.logRotation) {
    merged.logRotation = {
      ...base.logRotation,
      ...override.logRotation
    }
  }

  if (base.timestamp || override.timestamp) {
    merged.timestamp = {
      ...base.timestamp,
      ...override.timestamp
    }
  }

  return merged
}

/** Applies preset defaults; explicit `config` keys override preset values. */
export const resolveOptions = (options: Options = {}): Options => {
  const { preset } = options
  if (preset && !VALID_PRESETS.includes(preset)) {
    throw new Error(`logixlysia: invalid preset — ${preset}`)
  }

  const resolved = preset
    ? {
        ...options,
        config: mergeConfig(PRESET_DEFAULTS[preset], options.config)
      }
    : options

  validateLogRotation(resolved.config)
  return resolved
}
