import type { CreateElogsOptions } from "../interfaces";
import { parseInterval, parseRetention, parseSize } from "../utils/rotation";
import { getPresetDefaults } from "./preset-registry";

/**
 * 内置 preset 名 —— 给 IDE 自动补全。
 * 任意字符串都能传,运行时从 registry 查表(用户可以通过
 * `registerPreset` 加自己的 preset)。
 *
 * @public
 */
export type LogPreset = "dev" | "prod" | "json" | (string & {});

const validateLogRotation = (config: CreateElogsOptions["config"]): void => {
  const logRotation = config?.logRotation;
  if (!logRotation) {
    return;
  }

  try {
    if (logRotation.maxSize !== undefined) {
      parseSize(logRotation.maxSize);
    }
    if (logRotation.maxFiles !== undefined) {
      parseRetention(logRotation.maxFiles);
    }
    if (logRotation.interval !== undefined) {
      parseInterval(logRotation.interval);
    }
    if (
      logRotation.compression !== undefined &&
      logRotation.compression !== "gzip"
    ) {
      throw new Error(
        `Invalid compression algorithm: ${logRotation.compression}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`createElogs: invalid logRotation config — ${message}`, {
      cause: error,
    });
  }
};

const mergeConfig = (
  base: NonNullable<CreateElogsOptions["config"]>,
  override?: CreateElogsOptions["config"]
): NonNullable<CreateElogsOptions["config"]> => {
  if (!override) {
    return base;
  }

  const merged: NonNullable<CreateElogsOptions["config"]> = {
    ...base,
    ...override,
  };

  if (base.pino || override.pino) {
    merged.pino = {
      ...base.pino,
      ...override.pino,
      ...(base.pino?.prettyPrint !== undefined ||
      override.pino?.prettyPrint !== undefined
        ? {
            prettyPrint: override.pino?.prettyPrint ?? base.pino?.prettyPrint,
          }
        : {}),
    };
  }

  if (base.logFilter || override.logFilter) {
    merged.logFilter = {
      ...base.logFilter,
      ...override.logFilter,
    };
  }

  if (base.logRotation || override.logRotation) {
    merged.logRotation = {
      ...base.logRotation,
      ...override.logRotation,
    };
  }

  if (base.timestamp || override.timestamp) {
    const baseTs = (base.timestamp ?? {}) as Record<string, unknown>;
    const overrideTs = (override.timestamp ?? {}) as Record<string, unknown>;
    merged.timestamp = {
      ...baseTs,
      ...overrideTs,
    } as NonNullable<CreateElogsOptions["config"]>["timestamp"];
  }

  return merged;
};

/** Applies preset defaults; explicit `config` keys override preset values.
 *
 * @internal
 */
export const resolveOptions = (
  options: CreateElogsOptions = {}
): CreateElogsOptions => {
  const { preset } = options;

  const resolved = preset
    ? {
        ...options,
        config: mergeConfig(
          getPresetDefaults(preset) ??
            (() => {
              throw new Error(`createElogs: invalid preset — ${preset}`);
            })(),
          options.config
        ),
      }
    : options;

  validateLogRotation(resolved.config);
  return resolved;
};
