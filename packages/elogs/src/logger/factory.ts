/**
 * createElogs 2.0 — Logger 工厂
 *
 * 功能封装：
 * - 单一 emit 管道（emit.ts）：filter → context merge → redact → transports → file → console
 * - 通过 Proxy 实现懒加载 Pino：仅在首次访问时构造 Pino 实例，无效配置将快速失败（fail-fast）
 * - RequestContextStore：支持按请求累积上下文（通过 getContext/mergeContext）
 *
 * 公共 API 包含 9 个方法（已全部实现）：
 * - debug / info / warn / error
 * - log（显式指定日志级别）
 * - handleHttpError
 * - getContext / mergeContext
 * - pino（底层 Pino 实例）
 */

import type {
  Logger as PinoLogger,
  LoggerOptions as PinoLoggerOptions,
} from "pino";
import pino from "pino";
import {
  createRequestContextStore,
  mergeLogDataContext,
  type RequestContextStore,
} from "../context/request-context";
import type {
  CreateElogsOptions,
  Logger,
  LogLevel,
  Pino,
  StoreData,
} from "../interfaces";
import { redact, redactRequest } from "../utils/redact";
import {
  createFormatContext,
  type FormatContext,
  logWithPino,
  type PrecomputedLogParts,
} from "./create-logger";
import {
  computePrecomputedLogParts,
  emit,
  resolveSinks,
  shouldLogForOptions,
} from "./emit";
import { handleHttpError } from "./handle-http-error";

/** @internal */
export type PinoFactory = (options: PinoLoggerOptions) => PinoLogger;

/**
 * 默认的 Pino 工厂函数
 * Bun 运行时自动检测；pino-pretty 为可选开启
 */
const defaultPinoFactory: PinoFactory = (options) =>
  pino(options) as unknown as PinoLogger;

/** @internal */
export interface CreateLoggerOptions {
  contextStore?: RequestContextStore;
  options: CreateElogsOptions;
  pinoFactory?: PinoFactory;
}

/**
 * 类型守卫：判断是否为 CreateLoggerOptions
 */
const isCreateLoggerOptions = (value: unknown): value is CreateLoggerOptions =>
  typeof value === "object" &&
  value !== null &&
  "options" in value &&
  (value as any).options !== undefined;

/**
 * 创建静默 Pino Logger（用于 pino.enabled === false）
 */
const createSilentPinoLogger = (): Pino =>
  ({
    debug: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    info: () => undefined,
    level: "silent",
    silent: () => undefined,
    trace: () => undefined,
    warn: () => undefined,
  }) as unknown as Pino;

/**
 * 构建 Pino 配置选项
 */
const buildPinoOptions = (
  config: CreateElogsOptions["config"]
): PinoLoggerOptions => {
  // `prettyPrint` 是 elogs 侧的开关字段(不是 pino 自身的选项):
  // - 当 `prettyPrint === true` 时,我们把它转译成 pino-pretty transport
  //   (pino 7+ 已不再内置支持 prettyPrint 选项)
  // - 字段本身**必须**在传到 pino 之前剥掉,否则 pino 会在 transport 之前
  //   先抛 "prettyPrint option is no longer supported"
  // destructure 比 spread + delete 更干净,也避免 TS 抱怨 prettyPrint 不在
  // pino 的 LoggerOptions 类型上(pino 7+ 已移除该字段)。
  const { prettyPrint, ...restPinoConfig } = (config?.pino ?? {}) as Record<
    string,
    unknown
  >;
  const pinoOptions: PinoLoggerOptions = {
    level: "info",
    ...(restPinoConfig as PinoLoggerOptions | undefined),
  };

  if (prettyPrint === true) {
    pinoOptions.transport = {
      options: {
        colorize: process.stdout?.isTTY === true,
        translateTime:
          typeof config?.timestamp === "string" ? config.timestamp : undefined,
      },
      target: "pino-pretty",
    };
  }

  return pinoOptions;
};

/**
 * 构建一个与单一 emit 管道绑定的 Logger 实例。
 * `pino` 字段是一个懒加载的 Proxy：仅在首次访问时构建底层 Pino 实例。
 * 如果设置了 `config.pino`，则首次访问时若配置无效将快速失败（fail-fast）。
 * @internal
 */
export const createLogger = (
  optionsOrConfig?: CreateElogsOptions | CreateLoggerOptions,
  externalPinoFactory?: PinoFactory,
  externalContextStore?: RequestContextStore
): Logger => {
  // ============ 1. 参数解析 ============
  let options: CreateElogsOptions;
  let pinoFactory: PinoFactory;
  let contextStore: RequestContextStore | undefined;

  if (isCreateLoggerOptions(optionsOrConfig)) {
    // 新式调用：{ options, pinoFactory?, contextStore? }
    ({
      options,
      pinoFactory = defaultPinoFactory,
      contextStore,
    } = optionsOrConfig);
  } else {
    // 旧式调用：options?, pinoFactory?, contextStore?
    options = optionsOrConfig ?? {};
    pinoFactory = externalPinoFactory ?? defaultPinoFactory;
    contextStore = externalContextStore;
  }

  const config = options.config ?? {};
  const activeContextStore = contextStore ?? createRequestContextStore();
  const logDestinations = resolveSinks(options);
  const formatContext: FormatContext = createFormatContext(options);

  // ============ 2. 懒加载 Pino 实例 ============
  let pinoInstance: Pino | null = null;
  let pinoInitError: Error | null = null;

  /**
   * 获取或创建 Pino 实例（懒加载）
   * 如果配置了 pino.enabled === false，返回静默 Logger
   * 如果配置无效，快速失败（fail-fast）
   */
  const getOrCreatePino = (): Pino => {
    // 已初始化成功
    if (pinoInstance) {
      return pinoInstance;
    }

    // 之前初始化失败，直接抛出错误
    if (pinoInitError) {
      throw pinoInitError;
    }

    try {
      // pino.enabled === false：返回静默 Logger
      if (config.pino?.enabled === false) {
        pinoInstance = createSilentPinoLogger();
        return pinoInstance;
      }

      // 构建 Pino 配置并创建实例
      const pinoOptions = buildPinoOptions(config);
      pinoInstance = pinoFactory(pinoOptions) as unknown as Pino;
      return pinoInstance;
    } catch (error) {
      pinoInitError = error as Error;
      throw error;
    }
  };

  // 如果用户提供了 pino 配置，立即初始化以暴露配置错误
  if (config.pino !== undefined) {
    getOrCreatePino();
  }

  /**
   * Pino 代理对象：懒加载访问 Pino 实例的所有方法
   */
  const pinoProxy: Pino = new Proxy({} as Pino, {
    get(_target, propertyKey) {
      const pinoLogger = getOrCreatePino();
      const value = (pinoLogger as any)[propertyKey];

      if (typeof value === "function") {
        return value.bind(pinoLogger);
      }
      return value;
    },
    has(_target, propertyKey) {
      const pinoLogger = getOrCreatePino();
      return propertyKey in (pinoLogger as any);
    },
  });

  // ============ 3. 数据脱敏工具 ============
  /**
   * 对数据和请求执行脱敏处理
   */
  const sanitizeDataAndRequest = (
    data: Record<string, unknown>,
    request: Request
  ): { sanitizedData: Record<string, unknown>; sanitizedRequest: Request } => {
    if (config.autoRedact !== true) {
      return { sanitizedData: data, sanitizedRequest: request };
    }

    return {
      sanitizedData: redact(data, config.redactKeys),
      sanitizedRequest: redactRequest(request, config.redactKeys),
    };
  };

  // ============ 4. 核心日志处理函数 ============

  /**
   * 执行日志记录的核心逻辑
   * 1. 检查是否应该记录
   * 2. 合并上下文
   * 3. 执行脱敏（redact）
   * 4. 预计算日志部分
   * 5. 发送到所有目标（sinks）
   * 6. 转发到 Pino（如果启用）
   */
  const executeLog = (
    level: LogLevel,
    request: Request,
    logData: Record<string, unknown>,
    storeData: StoreData
  ): void => {
    // 快速路径：检查是否应该记录此日志
    if (
      logDestinations.isEffectivelyDisabled ||
      !shouldLogForOptions(level, options)
    ) {
      return;
    }

    // 合并请求上下文
    const dataWithContext = mergeLogDataContext(
      logData,
      activeContextStore.peekContext(request)
    );

    // 执行数据脱敏
    const { sanitizedData, sanitizedRequest } = sanitizeDataAndRequest(
      dataWithContext,
      request
    );

    // 预计算日志部分（优化性能）
    const precomputedParts: PrecomputedLogParts = computePrecomputedLogParts(
      storeData,
      sanitizedRequest,
      logDestinations.needsUrlParts
    );

    // 发送到所有日志目标
    emit({
      contextStore: activeContextStore,
      data: sanitizedData,
      formatContext,
      level,
      options,
      precomputed: precomputedParts,
      request: sanitizedRequest,
      sinks: logDestinations,
      store: storeData,
    });

    // 如果 Pino 已启用，同时转发给 Pino
    if (config.pino?.enabled !== false && logDestinations.hasInternalLogger) {
      logWithPino(getOrCreatePino(), level, sanitizedData);
    }
  };

  /**
   * 带上下文合并的日志记录包装器
   * 1. 合并传入的上下文到请求上下文
   * 2. 准备 storeData
   * 3. 调用核心日志函数
   */
  const logWithMergedContext = (
    level: LogLevel,
    request: Request,
    message: string,
    additionalContext?: Record<string, unknown>
  ): void => {
    // 合并上下文
    if (additionalContext) {
      activeContextStore.mergeContext(request, additionalContext);
    }

    // 准备 storeData
    let pathname: string;
    try {
      ({ pathname } = new URL(request.url));
    } catch {
      pathname = "invalid-url";
    }

    const storeData: StoreData = {
      beforeTime: process.hrtime.bigint(),
      pathname,
    };

    // 执行日志记录
    executeLog(level, request, { message }, storeData);
  };

  // ============ 5. 日志级别映射 ============
  const LOG_LEVELS = {
    DEBUG: "DEBUG",
    ERROR: "ERROR",
    INFO: "INFO",
    WARN: "WARNING",
  } as const;

  // ============ 6. 返回 Logger 实例 ============
  return {
    // 标准日志方法
    debug: (request, message, context) =>
      logWithMergedContext(LOG_LEVELS.DEBUG, request, message, context),

    error: (request, message, context) =>
      logWithMergedContext(LOG_LEVELS.ERROR, request, message, context),

    // 上下文管理
    getContext: (request) => activeContextStore.getContext(request),

    // HTTP 错误处理
    handleHttpError: (request, error, storeData) => {
      handleHttpError(request, error, storeData, options);
    },

    info: (request, message, context) =>
      logWithMergedContext(LOG_LEVELS.INFO, request, message, context),

    // 显式指定级别的日志方法
    log: executeLog,
    mergeContext: (request, partialContext) =>
      activeContextStore.mergeContext(request, partialContext),

    // 底层 Pino 实例（懒加载代理）
    pino: pinoProxy,

    warn: (request, message, context) =>
      logWithMergedContext(LOG_LEVELS.WARN, request, message, context),
  };
};
