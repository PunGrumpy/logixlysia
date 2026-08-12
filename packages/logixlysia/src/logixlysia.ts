/**
 * logixlysia 2.0 — 日志插件主入口
 *
 * 核心职责：为 Elysia 框架提供企业级日志能力
 *
 * 主要功能：
 * - ✅ 请求/响应自动日志记录
 * - ✅ 请求ID追踪（支持header传递）
 * - ✅ 性能计时（请求耗时统计）
 * - ✅ WebSocket日志支持
 * - ✅ 异步本地存储（深度调用链日志）
 * - ✅ 多种预设模式（dev/prod/json）
 */

import { Elysia } from "elysia";
import { resolveOptions } from "./config";
import { createRequestContextStore, createRequestScopedLogger, loggerStorage } from "./context";
import { applyErrorLogging } from "./errors";
import { startServer } from "./extensions";
import { Logger, LogixlysiaOptions, LogixlysiaStore, RequestScopedLogger } from "./interfaces";
import { createLogger } from "./logger";
import { getOrCreateRequestId, resolveRequestIdConfig } from "./middleware";
import { createWsHandlerWrapper } from "./websocket";

// ============================================================
// 1. 类型定义 - 描述插件对外暴露的能力
// ============================================================

/**
 * 空插槽类型 - Elysia 2 要求所有插槽必须是对象类型
 * 用空对象表示"这个槽位不暴露任何内容"
 */
export type EmptyElysiaSlot = Record<string, never>;

/**
 * 插件单例接口 - 定义插件注入到 Elysia 的内容
 */
export interface LogixlysiaSingleton {
  decorator: Record<string, unknown>;      // 装饰器（扩展函数）
  derive: { log: RequestScopedLogger };    // 派生属性（每个请求的logger）
  resolve: Record<string, never>;          // 解析器（无）
  store: LogixlysiaStore;                  // 存储状态
}

/**
 * 完整插件类型 - 合并了 Elysia 和插件自定义能力
 */
export type Logixlysia = Elysia<"", "local", LogixlysiaSingleton>;

/**
 * 插件返回类型 - 包含 WebSocket 包装器
 */
export type LogixlysiaPlugin = Logixlysia & {
  wrapWs: ReturnType<typeof createWsHandlerWrapper>;
};

// ============================================================
// 2. 主函数 - 插件入口
// ============================================================

export const logixlysia = (options: LogixlysiaOptions = {}): LogixlysiaPlugin => {
  // ------------------------------------------------------------
  // 第一步：解析配置（支持预设模式 dev/prod/json）
  // ------------------------------------------------------------
  const resolvedOptions = resolveOptions(options);

  // ------------------------------------------------------------
  // 第二步：创建核心状态容器
  // ------------------------------------------------------------

  // 2.1 请求开始时间映射（使用 WeakMap 避免内存泄漏）
  const requestStartTimes = new WeakMap<Request, bigint>();

  // 2.2 自定义日志标记（避免重复记录）
  const didCustomLog = new WeakSet<Request>();

  // 2.3 请求上下文存储（存放 requestId 等）
  const contextStore = createRequestContextStore();

  // ------------------------------------------------------------
  // 第三步：创建日志核心
  // ------------------------------------------------------------

  // 3.1 创建基础日志器
  const baseLogger = createLogger(resolvedOptions, undefined, contextStore);

  // 3.2 包装日志方法 - 标记"已自定义记录"
  const wrap = (
    fn: (request: Request, message: string, context?: Record<string, unknown>) => void
  ): ((request: Request, message: string, context?: Record<string, unknown>) => void) =>
    (request, message, context) => {
      didCustomLog.add(request);  // 标记该请求已手动记录
      fn(request, message, context);
    };

  // 3.3 构建完整的日志器（包装了 debug/error/info/warn）
  const logger: Logger = {
    ...baseLogger,
    debug: wrap(baseLogger.debug),
    error: wrap(baseLogger.error),
    info: wrap(baseLogger.info),
    warn: wrap(baseLogger.warn),
  };

  // ------------------------------------------------------------
  // 第四步：解析其他配置项
  // ------------------------------------------------------------

  // 4.1 请求ID配置
  const requestIdConfig = resolveRequestIdConfig(
    resolvedOptions.config?.requestId ?? false
  );

  // 4.2 是否启用异步本地存储（深度调用链支持）
  const useALS = resolvedOptions.config?.useAsyncLocalStorage === true;

  // ------------------------------------------------------------
  // 第五步：构建 Elysia 插件
  // ------------------------------------------------------------

  // 5.1 创建插件实例
  const app = new Elysia({ name: "Logixlysia" });

  // 5.2 注册中间件 - 请求阶段
  // 职责：记录开始时间、设置 requestId、进入异步上下文
  const withLogger = app
    // 存储状态
    .state("logger", logger)
    .state("pino", logger.pino)
    .state("beforeTime", BigInt(0))
    .state("pathname", "")

    // 【请求中间件】请求进入时执行
    .request(({ request, store }) => {
      // 记录请求开始时间
      const now = process.hrtime.bigint();
      requestStartTimes.set(request, now);

      // 存储到 Elysia store（兼容老版本）
      const storeObj = store as { beforeTime: bigint; pathname: string };
      storeObj.beforeTime = now;
      try {
        storeObj.pathname = new URL(request.url).pathname;
      } catch {
        storeObj.pathname = "/";
      }

      // 生成/提取请求ID
      if (requestIdConfig) {
        const id = getOrCreateRequestId(request, requestIdConfig);
        contextStore.mergeContext(request, { requestId: id });
      }

      // 如果启用 ALS，进入异步本地存储作用域
      //
      // Elysia 2 内部对每个请求会包一层自己的 `als.run()` scope(用来传递
      // request / store / derive 的值)。我们的 `.request()` 钩子是在那个
      // scope 内被回调的,所以这里 `enterWith` 设进去的值,会**透传**到后续
      // 的路由 handler / `.afterHandle()`,只要 Elysia 自己在它们之间不再
      // 重新起一个 `als.run()`(目前 Elysia 2.x 不会,但升级时要注意)。
      //
      // 取舍:我们没法在 Elysia 自己的 async 上下文之外拦截请求,所以**无法**
      // 用 `loggerStorage.run()` 把整个请求包起来 —— 那是 Elysia 才能做的
      // 事。一旦 Elysia 之后在内部多次 `als.run()`,这个 `enterWith` 就会被
      // 切断,`useLogger()` 在深调用栈里会回到 NOOP_LOGGER。
      //
      // 推荐用法:深调用栈优先用 `({ log })` 的 derive(它走 Elysia 自己的
      // context 机制,不依赖 ALS),`useLogger()` 仅用于"想拿到 logger 但
      // 不想在签名里穿 ctx"的简单场景。
      if (useALS) {
        loggerStorage.enterWith(
          createRequestScopedLogger(logger, request, contextStore)
        );
      }
    })

    // 【响应中间件】响应返回时执行
    // 职责：回写 requestId header、记录日志、清理状态
    .afterHandle(({ request, set, store }) => {
      // 5.2.1 响应头回写 requestId
      if (requestIdConfig) {
        const id = contextStore.getContext(request).requestId as string | undefined;
        if (id) {
          set.headers[requestIdConfig.header] = id;
        }
      }

      // 5.2.2 如果已自定义记录，跳过自动记录
      if (didCustomLog.has(request)) {
        return;
      }

      // 5.2.3 根据状态码确定日志级别
      const status = typeof set.status === "number" ? set.status : 200;
      let level: "INFO" | "WARNING" | "ERROR" = "INFO";
      if (status >= 500) level = "ERROR";
      else if (status >= 400) level = "WARNING";

      // 5.2.4 构建请求上下文（包含开始时间用于计算耗时）
      const beforeTime = requestStartTimes.get(request) ?? BigInt(0);
      const pathname = (store as { pathname?: string }).pathname ||
        (() => {
          try {
            return new URL(request.url).pathname;
          } catch {
            return "/";
          }
        })();

      const syntheticStore = {
        ...(store as object),
        beforeTime,
        pathname,
      } as Parameters<typeof logger.log>[3];

      // 5.2.5 记录日志
      logger.log(level, request, { status }, syntheticStore);

      // 5.2.6 清理请求相关的状态（防止内存泄漏）
      requestStartTimes.delete(request);
      contextStore.clearContext(request);
    });

  // ------------------------------------------------------------
  // 第六步：注册启动钩子（启动时打印 banner）
  // ------------------------------------------------------------
  const withStart = (
    withLogger as unknown as {
      setup: (fn: (instance: unknown) => void) => typeof withLogger;
    }
  ).setup((instance: unknown) => {
    // 获取服务器信息
    const candidate = (instance as { server?: unknown }).server;
    let server: { port?: number; hostname?: string; protocol?: string | null };
    if (candidate && typeof candidate === "object") {
      server = candidate as typeof server;
    } else {
      const port = Number(process.env["PORT"]) || 3000;
      const hostname = process.env["HOST"] || "localhost";
      server = { hostname, port, protocol: "http" };
    }
    // 打印启动 banner
    startServer(server, resolvedOptions);
  });

  // ------------------------------------------------------------
  // 第七步：注册错误处理
  // ------------------------------------------------------------
  const withErrors = applyErrorLogging(
    withStart,
    logger,
    resolvedOptions,
    didCustomLog,
    requestIdConfig?.header ?? "X-Request-Id"
  );

  // ------------------------------------------------------------
  // 第八步：派生请求级日志器（让路由通过 ({ log }) 使用）
  // ------------------------------------------------------------
  const withDerive = (
    withErrors as unknown as {
      derive: <T extends Record<string, unknown>>(fn: (ctx: unknown) => T) => typeof withErrors;
    }
  ).derive((ctx: unknown) => {
    const request = (ctx as { request?: Request }).request;
    if (!request) {
      return { log: undefined as unknown as RequestScopedLogger };
    }
    return {
      log: createRequestScopedLogger(logger, request, contextStore),
    };
  });

  // ------------------------------------------------------------
  // 第九步：应用到全局（使钩子生效于所有路由）
  // ------------------------------------------------------------
  const plugin = (withDerive as unknown as { as: (s: string) => Logixlysia }).as(
    "global"
  ) as Logixlysia;

  // ------------------------------------------------------------
  // 第十步：扩展 WebSocket 支持
  // ------------------------------------------------------------
  const wrapWs = createWsHandlerWrapper(resolvedOptions, logger, contextStore);

  // ------------------------------------------------------------
  // 第十一步：返回最终插件
  // ------------------------------------------------------------
  const finalPlugin = Object.assign(plugin, {
    wrapWs,  // 附加 WebSocket 包装器
  }) as LogixlysiaPlugin;

  return finalPlugin;
};

export default logixlysia;