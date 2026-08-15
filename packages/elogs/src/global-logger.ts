/**
 * 全局 Logger 实例管理
 *
 * 负责创建和管理全局唯一的 Logger 实例,供整个应用使用。
 * 导出三个核心 API:
 * - `globalLogger` — 包装后的 GlobalLogger(请求作用域内走完整 emit,作用域外降级为 pino)
 * - `pino`        — 顶层 pino 实例,用于无 request 场景直接记录日志
 * - `initGlobalLogger` / `resetGlobalLogger` / `getGlobalLogger` / `isGlobalLoggerInitialized`
 *
 * @example
 * // 在任意文件中使用
 * import { globalLogger, pino } from '@pori15/elogs';
 *
 * // 请求作用域内(路由 handler / 中间件 / hook)
 * globalLogger.info('User logged in');
 *
 * // 错误处理 —— Error 实例自动 unwrap
 * try { ... } catch (err) { globalLogger.error(err); }
 *
 * // 模块顶层 / 后台任务 —— 直接用顶层 pino
 * pino.info('Module loaded');
 */

import { createRequestContextStore } from "./context/request-context";
import { requestStorage } from "./context/storage";
import type {
  CreateElogsOptions,
  GlobalLogger,
  Logger,
  Pino,
} from "./interfaces";
import { createLogger } from "./logger";

let globalLoggerImpl: GlobalLogger | undefined;
const globalContextStore = createRequestContextStore();
let hasWarnedNoRequest = false;

/**
 * Requests that have been explicitly logged via `globalLogger` (i.e. caller
 * emitted a custom log line). The plugin's afterHandle hook checks this
 * WeakSet in addition to its own per-instance one, so that emitting through
 * `globalLogger` suppresses the auto access log the same way emitting
 * through the per-instance `logger` does.
 *
 * @internal
 */
export const globalCustomLoggedRequests = new WeakSet<Request>();

const unwrapError = (
  message: string | Error,
  context?: Record<string, unknown>
): { message: string; context: Record<string, unknown> } => {
  if (message instanceof Error) {
    return {
      context: {
        ...(message.stack ? { stack: message.stack } : {}),
        ...(message.name ? { errorName: message.name } : {}),
        ...context,
      },
      message: message.message,
    };
  }
  return { context: context ?? {}, message };
};

const warnOnceNoRequest = (method: string) => {
  if (hasWarnedNoRequest) {
    return;
  }
  hasWarnedNoRequest = true;
  console.warn(
    `[elogs] globalLogger.${method}() called outside request scope, falling back to pino. ` +
      "If you want full emit (file/transports/console format), call from inside a route handler."
  );
};

const wrap = (logger: Logger): GlobalLogger => {
  const emit = (
    method: "info" | "warn" | "debug",
    message: string,
    context?: Record<string, unknown>
  ) => {
    const request = requestStorage.getStore();
    if (request) {
      // 标记:globalLogger 在请求作用域内的 emit 应当像 per-instance logger
      // 一样,抑制 plugin 的 afterHandle 自动访问日志
      globalCustomLoggedRequests.add(request);
      logger[method](request, message, context);
    } else {
      warnOnceNoRequest(method);
      // 降级路径走顶层 pino(也可走 logger.pino,等价;顶层更直观)
      logger.pino[method](context ?? {}, message);
    }
  };

  return {
    debug: (message, context) => emit("debug", message, context),
    error: (message, context) => {
      const { message: msg, context: ctx } = unwrapError(message, context);
      const request = requestStorage.getStore();
      if (request) {
        globalCustomLoggedRequests.add(request);
        logger.error(request, msg, ctx);
      } else {
        warnOnceNoRequest("error");
        logger.pino.error(ctx, msg);
      }
    },
    getContext: () => {
      const request = requestStorage.getStore();
      if (request) {
        return logger.getContext(request);
      }
      warnOnceNoRequest("getContext");
      return {};
    },
    info: (message, context) => emit("info", message, context),
    mergeContext: (partial) => {
      const request = requestStorage.getStore();
      if (request) {
        logger.mergeContext(request, partial);
      } else {
        warnOnceNoRequest("mergeContext");
      }
    },
    warn: (message, context) => emit("warn", message, context),
  };
};

/**
 * 顶层 pino 导出 —— 直接拿到底层 pino 实例,**不需要**请求作用域。
 *
 * 适用于:
 * - 模块初始化时的 banner / startup log
 * - 后台任务、调度任务、WebSocket 关闭钩子等无 request 场景
 * - DB 层独立调用(不经过 Elysia handler)
 *
 * 必须在 `initGlobalLogger()` 或 `createElogs()` 调用之后访问,否则为 undefined。
 *
 * @example
 * ```ts
 * import { pino } from "@pori15/elogs";
 * pino.info("module loaded");
 * ```
 *
 * @public
 */
export let pino: Pino = (() => {
  // 模块加载时立即初始化 fallback pino — 让 `import { pino }` 永远可用
  // (无需先调 `initGlobalLogger`)。fallback 用 prod preset 默认配置;
  // 用户调 `initGlobalLogger(options)` 后会替换这个实例。
  try {
    return createLogger({}, undefined, globalContextStore).pino;
  } catch {
    // 极端情况下 createLogger 失败,留 placeholder(调用方能 import 但不能 log)
    return undefined as unknown as Pino;
  }
})();

/** 全局 Logger 实例,通过 `import { globalLogger } from "@pori15/elogs"` 拿到。
 *
 * @public
 */
export let globalLogger: GlobalLogger;

/** Replaces the active global logger implementation (e.g. in custom bootstraps).
 *
 * @public
 */
export const setGlobalLogger = (impl: GlobalLogger) => {
  globalLogger = impl;
  globalLoggerImpl = impl;
};

/** Initializes the top-level `pino` + `globalLogger` exports.
 *
 * @public
 */
export const initGlobalLogger = (
  options: CreateElogsOptions = {},
  contextStore = globalContextStore
): GlobalLogger => {
  if (globalLoggerImpl) {
    console.warn("Global logger already initialized, skipping re-init");
    return globalLoggerImpl;
  }
  const logger = createLogger(options, undefined, contextStore);
  // 同时初始化顶层 pino 导出和 globalLogger,让用户既能 `import { pino }`
  // 也能 `import { globalLogger }` 直接用
  ({ pino } = logger);
  const impl = wrap(logger);
  setGlobalLogger(impl);
  return impl;
};

/**
 * @internal
 * 检查全局 Logger 是否已初始化
 */
export const isGlobalLoggerInitialized = (): boolean =>
  globalLoggerImpl !== undefined;

/**
 * @internal
 * 重置全局 Logger(主要用于测试)
 */
export const resetGlobalLogger = (): void => {
  globalLoggerImpl = undefined;
  globalLogger = undefined as unknown as GlobalLogger;
  pino = undefined as unknown as Pino;
  // 一起清掉 no-scope warn 标志位,避免上一个测试的 warn 泄漏到下一个测试
  hasWarnedNoRequest = false;
};

/**
 * @internal
 * 获取全局 Logger,如果未初始化则抛出错误
 */
export const getGlobalLogger = (): GlobalLogger => {
  if (!globalLoggerImpl) {
    throw new Error(
      "Global logger not initialized. Please ensure createElogs is used before accessing globalLogger."
    );
  }
  return globalLoggerImpl;
};
