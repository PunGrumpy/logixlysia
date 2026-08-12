/**
 * logixlysia 2.0 — 插件入口
 *
 * 适配 Elysia 2.0 (>=2.0.0-exp.62):
 * - 删除自建 ProblemError/createProblem/HttpError 命名空间
 * - 错误分发改用 .error(Class, handler) 逐类注册
 * - RFC 9457 envelope 由 Elysia 原生 HTTPError/problem() 处理
 * - logixlysia 的核心价值:日志管道(transports + file + console)
 */

import { Elysia } from "elysia";
import { applyErrorLogging } from "./error-map";
import { startServer } from "./extensions";
import type { Logger, LogixlysiaOptions, LogixlysiaStore } from "./interfaces";
import { createLogger } from "./logger";

/** Elysia 2.0 不再 re-export SingletonBase,本地 inline 等价形状 */
type LocalSingleton = {
  decorator: Record<string, unknown>;
  store: Record<string, unknown>;
  derive: Record<string, unknown>;
};

export type Logixlysia = Elysia<
  "Logixlysia",
  "local",
  LocalSingleton & { store: LogixlysiaStore }
>;

export const logixlysia = (options: LogixlysiaOptions = {}): Logixlysia => {
  const didCustomLog = new WeakSet<Request>();
  const baseLogger = createLogger(options);
  const wrap =
    (
      fn: (
        request: Request,
        message: string,
        context?: Record<string, unknown>
      ) => void
    ): ((
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => void) =>
    (request, message, context) => {
      didCustomLog.add(request);
      fn(request, message, context);
    };
  const logger: Logger = {
    ...baseLogger,
    debug: wrap(baseLogger.debug),
    info: wrap(baseLogger.info),
    warn: wrap(baseLogger.warn),
    error: wrap(baseLogger.error),
  };

  const app = new Elysia({
    name: "Logixlysia",
  });

  const withLogger = app
    .state("logger", logger)
    .state("pino", logger.pino)
    .state("beforeTime", BigInt(0))
    .state("pathname", "")
    // Elysia 2.0:onRequest → request(无 body 解析需求,纯 timing capture)
    .request(({ request, store }) => {
      (store as { beforeTime: bigint; pathname: string }).beforeTime =
        process.hrtime.bigint();
      (store as { beforeTime: bigint; pathname: string }).pathname = new URL(
        request.url
      ).pathname;
    })
    // Elysia 2.0:onAfterHandle → afterHandle
    .afterHandle(({ request, set, store }) => {
      if (didCustomLog.has(request)) {
        return;
      }

      const status = typeof set.status === "number" ? set.status : 200;
      let level: "INFO" | "WARNING" | "ERROR" = "INFO";
      if (status >= 500) {
        level = "ERROR";
      } else if (status >= 400) {
        level = "WARNING";
      }

      logger.log(level, request, { status }, store);
    });

  // 注:Elysia 2.0.0-exp.62 没有 onStart 钩子(被 listen() 回调取代)。
  // 启动 banner 暂时关闭 —— 用户可以在 app.listen(port, () => logixlysiaBanner(server, options)) 中手动调用。
  // 见 extensions/index.ts 暴露的 startServer 函数。
  if (false as boolean) startServer; // 防止 lint 警告未使用
  if (false as boolean) options;

  // 错误注册:HTTPError 通用 + Elysia 内置具体类 + 用户自定义 + onError 兜底
  // 传 didCustomLog 让 error handler 标记本请求已记录,afterHandle 跳过避免重复
  const withErrors = applyErrorLogging(
    withLogger,
    logger,
    options,
    didCustomLog
  );

  // Elysia 2.0:用 .as("global") 让插件钩子在父 app 上生效(否则 plugin 内部的
  // request/afterHandle/error 只在 plugin 自己的路由上跑)。
  return (withErrors as unknown as { as: (s: string) => Logixlysia }).as(
    "global"
  );
};

// ==========================================
// Re-exports — Elysia 2.0 原生错误系统
// ==========================================

// 错误基类
// RFC 9457 辅助函数
// Elysia 内置错误类(logixlysia 已通过 .error() 自动注册)
export {
  ElysiaError,
  HTTPError,
  InternalServerError,
  InvalidCookie,
  NotFound,
  ParseError,
  problem,
  status,
  type TaggedHTTPError,
  ValidationError,
} from "elysia";
export type { LogixlysiaErrorClass } from "./error-map";
export { errorMap } from "./error-map";
// logixlysia 自带便利工厂
export { httpError } from "./evelyn-error";

// ==========================================
// Public Types
// ==========================================

export type {
  ErrorConfig,
  FileConfig,
  FormatConfig,
  Logger,
  LogixlysiaContext,
  LogixlysiaErrorClasses,
  LogixlysiaOptions,
  LogixlysiaStore,
  LogLevel,
  Pino,
  StartupConfig,
  StoreData,
  Transport,
  TransportsConfig,
} from "./interfaces";

export default logixlysia;
