import {
  mergeLogDataContext,
  type RequestContextStore,
} from "../context/request-context";
import type {
  CreateElogsOptions,
  LogLevel,
  StoreData,
  Transport,
} from "../interfaces";
import { logToTransports } from "../output";
import { logToFile } from "../output/file";
import { redact, redactRequest } from "../utils/redact";
import {
  type FormatContext,
  formatLogOutput,
  type PrecomputedLogParts,
} from "./create-logger";

/**
 * Which sinks are active for a given config, resolved once per logger
 * instance (see `createLogger`) since none of these depend on per-request
 * state.
 * @internal
 */
export interface Sinks {
  hasFileLogging: boolean;
  hasInternalLogger: boolean;
  hasTransports: boolean;
  /** True when no sink is active at all: `log()`/`handleHttpError()` can skip all work. */
  isEffectivelyDisabled: boolean;
  /** True when at least one active sink reads pathname/search (file logging or the console formatter). */
  needsUrlParts: boolean;
}

/**
 * Extracts the `Transport[]` array from a `CreateElogsOptions` object,
 * supporting both legacy shape (`transports: Transport[]`) and
 * the `TransportsConfig` envelope (`{ targets, only }`).
 * @internal
 */
export const resolveTransports = (options: CreateElogsOptions): Transport[] => {
  const configTransports = options.config?.transports;
  if (configTransports && configTransports.length > 0) {
    return configTransports;
  }
  const optTransports = options.transports;
  if (Array.isArray(optTransports)) {
    return optTransports;
  }
  if (optTransports && Array.isArray(optTransports.targets)) {
    return optTransports.targets;
  }
  return [];
};

/**
 * Returns true when the user set `transports.only: true` either on the
 * `config` (via `useTransportsOnly`) or on the legacy root-level
 * `transports: { only: true }` envelope.
 * @internal
 */
export const resolveTransportsOnly = (options: CreateElogsOptions): boolean => {
  if (options.config?.useTransportsOnly === true) {
    return true;
  }
  const optTransports = options.transports;
  if (
    optTransports &&
    !Array.isArray(optTransports) &&
    optTransports.only === true
  ) {
    return true;
  }
  return false;
};

/** @internal */
export const resolveSinks = (options: CreateElogsOptions): Sinks => {
  const { config } = options;
  const useTransportsOnly =
    resolveTransportsOnly(options) || config?.useTransportsOnly === true;
  const disableInternalLogger = config?.disableInternalLogger === true;
  const disableFileLogging = config?.disableFileLogging === true;

  const transports = resolveTransports(options);
  const hasTransports = transports.length > 0;
  const hasFileLogging =
    !(useTransportsOnly || disableFileLogging) && !!config?.logFilePath;
  const hasInternalLogger = !(useTransportsOnly || disableInternalLogger);
  const isEffectivelyDisabled = !(
    hasTransports ||
    hasFileLogging ||
    hasInternalLogger
  );
  const needsUrlParts = hasFileLogging || hasInternalLogger;

  return {
    hasFileLogging,
    hasInternalLogger,
    hasTransports,
    isEffectivelyDisabled,
    needsUrlParts,
  };
};

/** @internal */
export const shouldLog = (
  level: LogLevel,
  logFilter?: { level?: LogLevel[] }
): boolean => {
  if (!logFilter?.level || logFilter.level.length === 0) {
    return true;
  }
  return logFilter.level.includes(level);
};

/**
 * Combined filter check that also honors the root-level `logLevel` alias.
 * Empty / undefined level arrays mean "no filter" (all levels pass).
 * @internal
 */
export const shouldLogForOptions = (
  level: LogLevel,
  options: CreateElogsOptions
): boolean => {
  const configLevel = options.config?.logFilter?.level;
  if (configLevel && configLevel.length > 0 && !configLevel.includes(level)) {
    return false;
  }
  const rootLevel = options.logLevel;
  if (rootLevel && rootLevel.length > 0 && !rootLevel.includes(level)) {
    return false;
  }
  return true;
};

const computeDurationMs = (store: StoreData): number => {
  const before = store.beforeTime ?? BigInt(0);
  return before === BigInt(0)
    ? 0
    : Number(process.hrtime.bigint() - before) / 1_000_000;
};

/** Parses the URL once; only called when at least one active sink reads pathname/search. */
const parseRequestUrlOnce = (
  request: Request
): { pathname: string; search: string } => {
  try {
    const { pathname, search } = new URL(request.url);
    return { pathname, search };
  } catch {
    return { pathname: request.url || "/", search: "" };
  }
};

/**
 * Samples duration and parses the URL once per emission for the sinks that will actually run.
 * `logToTransports`' meta only reads `durationMs` (not pathname/search), so the URL is parsed
 * only when file logging or the internal console logger is active — skipping it entirely for
 * transports-only configs, matching that path's pre-optimization behavior.
 * @internal
 */
export const computePrecomputedLogParts = (
  store: StoreData,
  request: Request,
  needsUrlParts: boolean
): PrecomputedLogParts => {
  const durationMs = computeDurationMs(store);
  const { pathname, search } = needsUrlParts
    ? parseRequestUrlOnce(request)
    : { pathname: "", search: "" };

  return { durationMs, pathname, search };
};

const consoleForLevel = (level: LogLevel): typeof console.log => {
  switch (level) {
    case "DEBUG": {
      return console.debug;
    }
    case "INFO": {
      return console.info;
    }
    case "WARNING": {
      return console.warn;
    }
    case "ERROR": {
      return console.error;
    }
    default: {
      return console.log;
    }
  }
};

/** @internal */
export interface EmitInput {
  contextStore: RequestContextStore;
  data: Record<string, unknown>;
  /** Hoisted per-logger constants for `formatLogOutput`; only read when the internal console logger is active. */
  formatContext: FormatContext;
  level: LogLevel;
  options: CreateElogsOptions;
  /** Pre-sampled duration/pathname/search. If absent, emit falls back to store. */
  precomputed?: PrecomputedLogParts;
  request: Request;
  /** Hoisted per-logger sink gates from {@link resolveSinks}. */
  sinks: Sinks;
  store: StoreData;
}

/**
 * The single log-emission pipeline shared by the success path (`log()`) and
 * the error path (`handleHttpError()`): filter check -> context merge ->
 * redact -> transports -> file -> console, all gated by the same `sinks`.
 * @internal
 */
export const emit = ({
  contextStore,
  data,
  formatContext,
  level,
  options,
  request,
  sinks,
  store,
}: EmitInput): void => {
  const { config } = options;

  if (sinks.isEffectivelyDisabled || !shouldLogForOptions(level, options)) {
    return;
  }

  const dataWithContext = mergeLogDataContext(
    data,
    // mergeLogDataContext only reads/spreads this bag into a new object; it never retains
    // the reference, so a non-cloning peek is safe here.
    contextStore.peekContext(request)
  );
  const shouldRedact = config?.autoRedact === true;
  const logData = shouldRedact
    ? redact(dataWithContext, config?.redactKeys)
    : dataWithContext;
  const logRequest = shouldRedact
    ? redactRequest(request, config?.redactKeys)
    : request;

  const precomputed = computePrecomputedLogParts(
    store,
    logRequest,
    sinks.needsUrlParts
  );

  if (sinks.hasTransports) {
    logToTransports({
      data: logData,
      level,
      precomputed,
      request: logRequest,
      store,
      transports: resolveTransports(options),
    });
  }

  if (sinks.hasFileLogging) {
    const filePath = config?.logFilePath;
    if (filePath) {
      void logToFile({
        data: logData,
        filePath,
        level,
        options,
        precomputed,
        request: logRequest,
        store,
      });
    }
  }

  if (!sinks.hasInternalLogger) {
    return;
  }

  const { main, contextLines } = formatLogOutput({
    data: logData,
    formatContext,
    level,
    options,
    precomputed,
    request: logRequest,
    store,
  });
  const message =
    contextLines.length > 0 ? `${main}\n${contextLines.join("\n")}` : main;

  consoleForLevel(level)(message);
};
