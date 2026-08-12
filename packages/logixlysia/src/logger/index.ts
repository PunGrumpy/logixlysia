/**
 * logixlysia 2.0 — Logger 工厂
 *
 * 包装:
 * - 单 emit 管道(emit.ts):filter → context merge → redact → transports → file → console
 * - Lazy Pino via Proxy:pino 第一次访问时构造,无效配置 fail-fast
 * - RequestContextStore:per-request 累积 context(getContext/mergeContext)
 *
 * 公共 API 9 个方法(全部实现):
 * - debug / info / warn / error
 * - log (显式 level)
 * - handleHttpError
 * - getContext / mergeContext
 * - pino(底层)
 */

import pino from "pino";
import type {
  Logger as PinoLogger,
  LoggerOptions as PinoLoggerOptions,
} from "pino";
import {
  type RequestContextStore,
  createRequestContextStore,
  mergeLogDataContext,
} from "../context/request-context";
import type {
  LogLevel,
  Logger,
  LogixlysiaOptions,
  Pino,
  StoreData,
} from "../interfaces";
import { redact, redactRequest } from "../utils/redact";
import { handleHttpError } from "./handle-http-error";
import {
  type FormatContext,
  type PrecomputedLogParts,
  createFormatContext,
  formatLogOutput,
  logWithPino,
} from "./create-logger";
import {
  resolveSinks,
  computePrecomputedLogParts,
  emit,
  shouldLogForOptions,
} from "./emit";

export type PinoFactory = (options: PinoLoggerOptions) => PinoLogger;

const shouldLog = (
  level: LogLevel,
  logFilter?: { level?: LogLevel[] }
): boolean => {
  if (!logFilter?.level || logFilter.level.length === 0) {
    return true;
  }
  return logFilter.level.includes(level);
};

const defaultPinoFactory: PinoFactory = (options) => {
  // Bun's runtime auto-detects; pino-pretty is opt-in.
  return pino(options) as unknown as PinoLogger;
};

export interface CreateLoggerOptions {
  contextStore?: RequestContextStore;
  options: LogixlysiaOptions;
  pinoFactory?: PinoFactory;
}

/**
 * Build a Logger wired to the single emit pipeline. The `pino` field is a
 * lazy Proxy: the underlying Pino instance is only constructed on first access.
 * If `config.pino` is set, the first access fail-fasts on invalid config.
 */
export const createLogger = (
  optionsOrArg?: LogixlysiaOptions | CreateLoggerOptions,
  pinoFactoryArg?: PinoFactory,
  contextStoreArg?: RequestContextStore
): Logger => {
  // Backward-compat: 0/1-arg form used by tests/legacy code
  //   createLogger()
  //   createLogger({ config: {...} })
  // New 3-arg form (upstream main):
  //   createLogger({ options, pinoFactory?, contextStore? })
  let options: LogixlysiaOptions;
  let pinoFactory: PinoFactory | undefined;
  let contextStore: RequestContextStore | undefined;
  if (
    optionsOrArg &&
    typeof optionsOrArg === "object" &&
    "options" in (optionsOrArg as object) &&
    (optionsOrArg as { options?: unknown }).options !== undefined
  ) {
    const arg = optionsOrArg as CreateLoggerOptions;
    options = arg.options;
    pinoFactory = arg.pinoFactory;
    contextStore = arg.contextStore;
  } else {
    options = (optionsOrArg as LogixlysiaOptions | undefined) ?? {};
    pinoFactory = pinoFactoryArg;
    contextStore = contextStoreArg;
  }

  const factory = pinoFactory ?? defaultPinoFactory;
  const config = options.config ?? {};
  const sinks = resolveSinks(options);
  const formatContext: FormatContext = createFormatContext(options);

  // Lazy pino: built on first access via Proxy.
  let realPino: Pino | null = null;
  const getPino = (): Pino => {
    if (realPino) {
      return realPino;
    }
    // Build pino options from config.pino + format
    const pinoOptions: PinoLoggerOptions = {
      level: "info",
      ...((config.pino as PinoLoggerOptions | undefined) ?? {}),
    };
    // `pino.enabled === false` short-circuits to a silent logger
    if (config.pino?.enabled === false) {
      realPino = {
        // minimal mock — tests only check pino is not undefined
        debug: () => undefined,
        error: () => undefined,
        fatal: () => undefined,
        info: () => undefined,
        level: "silent",
        silent: () => undefined,
        trace: () => undefined,
        warn: () => undefined,
      } as unknown as Pino;
      return realPino;
    }
    if (config.pino?.prettyPrint === true) {
      pinoOptions.transport = {
        target: "pino-pretty",
        options: {
          colorize: process.stdout?.isTTY === true,
          translateTime: typeof config.timestamp === "string"
            ? config.timestamp
            : undefined,
        },
      };
    }
    realPino = factory(pinoOptions) as unknown as Pino;
    return realPino;
  };

  // If user provided a pino config, force build now so they see errors at startup
  if (config.pino !== undefined) {
    getPino();
  }

  const lazyPino: Pino = new Proxy({} as Pino, {
    get(_target, prop) {
      const p = getPino() as unknown as Record<string | symbol, unknown>;
      const value = p[prop as string];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(p) : value;
    },
    has(_target, prop) {
      return prop in (getPino() as unknown as object);
    },
  });

  const fallbackStore: RequestContextStore =
    contextStore ?? createRequestContextStore();

  const logImpl = (
    level: LogLevel,
    request: Request,
    data: Record<string, unknown>,
    store: StoreData
  ): void => {
    if (
      sinks.isEffectivelyDisabled ||
      !shouldLogForOptions(level, options)
    ) {
      return;
    }

    const dataWithContext = mergeLogDataContext(
      data,
      fallbackStore.peekContext(request)
    );
    const logData =
      config.autoRedact === true
        ? redact(dataWithContext, config.redactKeys)
        : dataWithContext;
    const logRequest =
      config.autoRedact === true
        ? redactRequest(request, config.redactKeys)
        : request;

    const precomputed: PrecomputedLogParts = computePrecomputedLogParts(
      store,
      logRequest,
      sinks.needsUrlParts
    );

    emit({
      contextStore: fallbackStore,
      data: logData,
      formatContext,
      level,
      options,
      precomputed,
      request: logRequest,
      sinks,
      store,
    });

    // Also forward to pino if pino is enabled
    if (config.pino?.enabled !== false && sinks.hasInternalLogger) {
      logWithPino(getPino(), level, logData);
    }
  };

  const logWithContext = (
    level: LogLevel,
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ): void => {
    if (context) {
      fallbackStore.mergeContext(request, context);
    }
    const store: StoreData = {
      beforeTime: process.hrtime.bigint(),
      pathname: new URL(request.url).pathname,
    };
    logImpl(level, request, { message }, store);
  };

  return {
    debug: (request, message, context) =>
      logWithContext("DEBUG", request, message, context),
    error: (request, message, context) =>
      logWithContext("ERROR", request, message, context),
    getContext: (request) => fallbackStore.getContext(request),
    handleHttpError: (request, error, store) => {
      handleHttpError(request, error, store, options);
    },
    info: (request, message, context) =>
      logWithContext("INFO", request, message, context),
    log: logImpl,
    mergeContext: (request, partial) =>
      fallbackStore.mergeContext(request, partial),
    pino: lazyPino,
    warn: (request, message, context) =>
      logWithContext("WARNING", request, message, context),
  };
};
