import type { Options } from '../interfaces'

export type LogPreset = 'dev' | 'prod' | 'json'

const PRESET_DEFAULTS: Record<LogPreset, NonNullable<Options['config']>> = {
  dev: {
    showStartupMessage: true,
    startupMessageFormat: 'banner',
    useColors: true,
    showContextTree: true,
    pino: {
      prettyPrint: true
    }
  },
  prod: {
    showStartupMessage: false,
    useColors: false,
    showContextTree: false,
    autoRedact: true,
    requestId: true,
    pino: {
      prettyPrint: false
    }
  },
  json: {
    showStartupMessage: false,
    useColors: false,
    showContextTree: false,
    pino: {
      prettyPrint: false
    }
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
  const preset = options.preset
  if (!preset) {
    return options
  }

  const presetConfig = PRESET_DEFAULTS[preset]
  return {
    ...options,
    config: mergeConfig(presetConfig, options.config)
  }
}
