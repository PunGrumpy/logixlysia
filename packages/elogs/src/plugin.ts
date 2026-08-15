/**
 * createElogs 2.0 — Elysia 2 日志插件（函数式插件）
 *
 * 核心能力：
 * - 请求/响应访问日志（根据状态码自动选择 INFO/WARNING/ERROR）
 * - 请求 ID 追踪（X-Request-Id 头透传 + 回显）
 * - 慢请求检测与标记
 * - 请求级上下文累积（mergeContext）
 * - WebSocket 生命周期日志（通过 `createWsHandlerWrapper` 单独提供）
 * - AsyncLocalStorage 透传（`useLogger()` 获取请求作用域 logger）
 * - 预设配置（dev / prod / json）+ 自定义预设（`registerPreset`）
 * - Pino 集成（`globalLogger.pino` + 透传 pino options）
 * - 文件日志 + 日志轮转
 * - 单点 onError 钩子:只记录日志,不劫持错误响应格式
 * - 可选 `autoTranslate`:在钩子里跑 Drizzle 等 DB 错误翻译,决定日志级别
 *
 * 设计原则:遵循 Elysia 2 官方推荐的函数式插件写法 —— `return new Elysia()...`
 * 单一链式调用,让 TypeScript 自行推断返回类型。brand 来自 elysia 模块内部,
 * `.use()` 无需任何 `as` / `any` / `@ts-expect-error` 妥协。
 *
 * **错误处理模型**(本次重设计):
 * - 插件**只**做一件事:记录错误日志
 * - 单一 `.error(handler)` 钩子在框架错误链路上运行,**不 return value**,
 *   让错误继续传播到用户的 `.error(MyClass, fn)` 或 Elysia 默认 problem 响应
 * - 用户想要自定义错误类?用 Elysia 2 原生 `class extends HTTPError` +
 *   `.error(MyClass, fn)`,**不**经过本插件
 * - 用户想要 DB 错误翻译?用 `createElogs/translator` 的 `translateDrizzleError`
 *   或 `autoTranslate: { db: 'drizzle' }` 配置
 *
 * 依赖方向：
 *   用户代码  →  createElogs(options)          →  Elysia 插件
 *   用户代码  →  createWsHandlerWrapper(...)       →  WebSocket hooks 工厂
 *   用户代码  →  httpError() / errorMap()          →  自定义 HTTPError 类
 *   用户代码  →  translateDrizzleError() (optional) →  DB 错误翻译
 *
 * 注意事项：
 * 不要在插件实例上挂载额外方法（如 `.wrapWs` 之类）：Elysia 2 的 `#private` brand
 * 与"实例上挂字段"存在结构性冲突，会导致 `.use()` 报类型错误。`wrapWs` 已作为
 * 独立导出提供，请直接使用。
 */

import {
  Elysia,
  type ErrorContext,
  HTTPError,
  type HTTPHeaders,
  type StatusMap,
} from "elysia";
import type { ErrorHandler } from "elysia/types";
import { resolveOptions } from "./config/resolve-options";
import { createRequestContextStore } from "./context/request-context";
import { loggerStorage, requestStorage } from "./context/storage";
import { startServer } from "./extensions";
// 导入全局 Logger 管理
import { globalCustomLoggedRequests, initGlobalLogger } from "./global-logger";
import { getStatusCode } from "./helpers/status";
import type {
  CreateElogsOptions,
  ElogsStore,
  ErrorTranslator,
  Logger,
  LogLevel,
  RequestScopedLogger,
} from "./interfaces";
import { createLogger } from "./logger";
import {
  getOrCreateRequestId,
  type ResolvedRequestIdConfig,
  resolveRequestIdConfig,
} from "./middleware/request-id";
import { translateDrizzleError } from "./translator/drizzle";

// ============================================================
// 类型定义
// ============================================================
// /**
//  * Elysia 2 单例接口 —— 注入到 Elysia 的 store / derive 中的类型定义。
//  *
//  * 关闭了 Elysia `SingletonBase.store` 的 `Record<string, unknown>` 索引签名
//  * （我们使用 `ElogsStore` 显式列举字段，合并后的 context / ws.data 能保持
//  * 精确推断，不会退化成 `any`）。`resolve` 槽位在 Elysia 2 中已被移除，不再导出。
//  */
// export interface ElogsSingleton {
//   decorator: Record<string, never>;
//   derive: { log: RequestScopedLogger };
//   store: ElogsStore;
// }

// ============================================================
// 主插件函数
// ============================================================

/** @public */
export const createElogs = (rawOptions: CreateElogsOptions = {}) => {
  // ---------- 1. 初始化 per-instance 状态 ----------
  const options = resolveOptions(rawOptions);
  const requestHasCustomLog = new WeakSet<Request>();
  const requestStartTimes = new WeakMap<Request, bigint>();
  const contextStore = createRequestContextStore();
  const baseLogger = createLogger(options, undefined, contextStore);

  // 初始化全局 Logger —— 关键:复用本实例的 contextStore,这样
  // `globalLogger.mergeContext({...})` 写入的数据会跟本实例的
  // access log context 合并(否则数据会丢在全局另一个 store 里)。
  initGlobalLogger(options, contextStore);

  /**
   * 创建带标记的 Logger 包装器
   * 每次调用日志方法时，标记该请求"已自定义记录"，使得 afterHandle 钩子跳过自动访问日志
   */
  const createMarkedLogger =
    (
      fn: (
        request: Request,
        message: string,
        context?: Record<string, unknown>
      ) => void
    ) =>
    (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ): void => {
      requestHasCustomLog.add(request);
      fn(request, message, context);
    };

  const logger: Logger = {
    ...baseLogger,
    debug: createMarkedLogger(baseLogger.debug),
    error: createMarkedLogger(baseLogger.error),
    info: createMarkedLogger(baseLogger.info),
    warn: createMarkedLogger(baseLogger.warn),
  };

  // 解析请求 ID 配置
  const requestIdConfig: ResolvedRequestIdConfig | null =
    resolveRequestIdConfig(options.config?.requestId);
  const useAsyncLocalStorage = options.config?.useAsyncLocalStorage === true;
  const verboseErrorLogging = options.error?.verbose === true;
  const { header: requestIdHeaderName = "X-Request-Id" } =
    requestIdConfig ?? {};

  // ---------- 2. 请求级 Logger 工厂 ----------
  /**
   * 创建请求作用域的 Logger 实例
   * 每个请求独立，自动关联当前请求的上下文
   */
  const createRequestScopedLogger = (
    request: Request
  ): RequestScopedLogger => ({
    debug: (message, context) => logger.debug(request, message, context),
    error: (message, context) => logger.error(request, message, context),
    info: (message, context) => logger.info(request, message, context),
    mergeContext: (partial) => contextStore.mergeContext(request, partial),
    warn: (message, context) => logger.warn(request, message, context),
  });

  // ---------- 3. 错误处理辅助函数 ----------
  /**
   * 将请求 ID 写入响应头
   * `set` 来自 Elysia 2 的 `ContextBase.set`（HTTPHeaders），不是泛型 Record
   */
  const setResponseRequestId = (
    request: Request,
    set?: { headers: HTTPHeaders }
  ): void => {
    if (!requestIdConfig) {
      return;
    }
    const id = contextStore.getContext(request).requestId as string | undefined;
    if (id && set) {
      set.headers = {
        ...set.headers,
        [requestIdHeaderName]: id,
      };
    }
  };

  /**
   * 根据 HTTP 状态码获取对应的日志级别
   * 5xx → ERROR, 4xx → WARNING, 其他 → INFO
   */
  const getLogLevelForStatus = (status: number): LogLevel => {
    if (status >= 500) {
      return "ERROR";
    }
    if (status >= 400) {
      return "WARNING";
    }
    return "INFO";
  };

  /**
   * 从任意错误对象中提取 status 字段。
   * 字段可能是 number、`keyof StatusMap` 字符串、或完全缺失。
   * 缺失时返回 `undefined` 让调用方决定兜底值(通常是 500)。
   */
  const extractErrorStatus = (error: unknown): number | undefined => {
    if (!error || typeof error !== "object") {
      return;
    }
    const { status } = error as { status?: unknown };
    if (typeof status === "number") {
      return status;
    }
    if (typeof status === "string") {
      return getStatusCode(status);
    }
  };

  /**
   * 从 error 提取一行 message(优先 Error.message,降级 String(error))。
   */
  const extractErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  /**
   * 从 error 提取 name(优先 Error.name,降级 "Error")。
   */
  const extractErrorName = (error: unknown): string =>
    error instanceof Error ? error.name : "Error";

  /**
   * 解析 autoTranslate 配置为单一聚合 translator。
   *
   * 内部走 `translateDrizzleError(error, custom)` —— 它自己决定:
   * 1. 先跑用户 custom(短链)
   * 2. 再跑内置 DRIZZLE_TRANSLATORS
   * 3. 不命中则原样返回
   *
   * 返回单元素数组让 onError 钩子的 `for...break` 循环天然短链。
   */
  const resolveTranslators = (): ErrorTranslator[] => {
    const at = options.autoTranslate;
    if (!at) {
      return [];
    }
    if (at.db !== "drizzle") {
      return [];
    }
    // 永远 canHandle: 内部 translateDrizzleError 决定是否真的换掉 error
    return [
      {
        canHandle: () => true,
        translate: (error) => translateDrizzleError(error, at.custom),
      },
    ];
  };

  // ---------- 5. 单点 onError 钩子 ----------
  /**
   * **核心设计**:
   * 1. 钩子**不 return value** —— 错误继续传播到用户的 `.error(MyClass, fn)`
   *    或 Elysia 默认 problem 响应。这是"不劫持错误处理流程"的根本。
   * 2. 钩子捕获**所有**进入错误管道的错误 —— 无论路由 `throw` 还是 `return`
   *    `Response(status >= 400)`,都会触发(Elysia 2 语义)。
   * 3. 翻译(translator)只决定日志级别和内容;翻译后丢弃,原 error 继续传播。
   *
   * 行为:
   * - 提取 status(从 error.status 或 HTTPError.status,默认 500)
   * - 提取 name / message
   * - 可选:跑 autoTranslate 链得到"翻译后 error"以决定 status(更准确的 4xx/5xx)
   * - 写日志(按 status 决定 ERROR / WARNING / INFO)
   * - 回显 request-id 到响应头
   * - 不 return → 错误继续向下游传播
   */
  // 单点 onError 钩子 —— 显式标注 Singleton 形状,匹配链上 .state() 累积的 store
  // Elysia 2 的 ErrorHandler 第三个泛型是 Singleton,默认值是 DefaultSingleton(store={}),
  // 链上 .state("beforeTime") 后变成 { beforeTime },必须显式标注才能赋值给 .error()。
  const logOnErrorHook: ErrorHandler<
    [],
    {},
    {
      decorator: Record<string, never>;
      store: {
        beforeTime: bigint;
        [key: string]: unknown;
      };
      derive: Record<string, never>;
    }
  > = (ctx) => {
    const { request, error, store, set } = ctx as ErrorContext & {
      error: unknown;
      store: ElogsStore;
      set: { headers: HTTPHeaders; status?: number | keyof StatusMap };
    };

    // 1) 翻译(可选)—— 翻译后的 error 只用于决定 status,原 error 保持不变
    const translators = resolveTranslators();
    let effectiveError: unknown = error;
    for (const t of translators) {
      if (t.canHandle(error)) {
        effectiveError = t.translate(error);
        break;
      }
    }

    // 2) 提取
    const rawStatus =
      extractErrorStatus(effectiveError) ??
      extractErrorStatus(error) ??
      (error instanceof HTTPError ? error.status : 500);
    const status = getStatusCode(rawStatus);
    const name = extractErrorName(effectiveError);
    const message = extractErrorMessage(effectiveError);

    // 3) 标记已记录 + 写日志
    requestHasCustomLog.add(request);
    const data: Record<string, unknown> = { message, name, status };
    if (effectiveError instanceof HTTPError) {
      data.type = effectiveError.type;
    }
    logger.log(getLogLevelForStatus(status), request, data, store);

    // 4) 详细错误日志(verbose 模式)
    if (verboseErrorLogging) {
      const errStr = JSON.stringify(error, null, 2);
      logger.warn(request, "Verbose error context", { error: errStr });
    }

    // 5) 回显 request-id
    setResponseRequestId(request, set);
    // 不 return —— 错误继续传播
  };

  // ---------- 6. 返回 Elysia 插件（单一链式调用） ----------
  return (
    new Elysia({ name: "Elogs" })
      // 初始化状态
      .state("beforeTime", BigInt(0))

      // 注入请求级 Logger
      .derive(({ request }) => ({ log: createRequestScopedLogger(request) }))

      // 启动服务器
      .setup(({ server }) => {
        if (server) {
          startServer(server, options);
          return;
        }
        const port = Number(process.env.PORT) || 3000;
        const hostname = process.env.HOST || "localhost";
        startServer({ hostname, port, protocol: "http" }, options);
      })

      // 请求前置处理
      .request(({ request, store }) => {
        const now = process.hrtime.bigint();
        requestStartTimes.set(request, now);
        // 写入 Elysia store，方便 handler / 测试直接使用 `store.beforeTime` 计算耗时
        (store as { beforeTime?: bigint }).beforeTime = now;

        // 生成/提取请求 ID
        if (requestIdConfig) {
          const id = getOrCreateRequestId(request, requestIdConfig);
          contextStore.mergeContext(request, { requestId: id });
        }

        // 总是把裸 request 放进 `requestStorage`,让 `globalLogger` (no-request API)
        // 能在 route handler / 中间件 / hook 里自动拿到当前 request 走完整 emit。
        // 这与 `useAsyncLocalStorage` 解耦 —— 该 flag 只控制 `loggerStorage`
        // (供 `useLogger()` 使用的 RequestScopedLogger),不影响 `globalLogger`。
        requestStorage.enterWith(request);

        // AsyncLocalStorage 支持
        // Elysia 2 在 hook 链路上有自己的 async scope，这里 enterWith
        // 设置的值会透传到 handler / afterHandle，只要 Elysia 不在中间
        // 额外调用 `als.run()`（Elysia 2.x 当前不会，升级时需回归测试）
        if (useAsyncLocalStorage) {
          const scoped = createRequestScopedLogger(request);
          loggerStorage.enterWith(scoped);
        }
      })

      // 请求后置处理（访问日志）
      .afterHandle(({ request, set }) => {
        try {
          // 回显请求 ID
          if (requestIdConfig) {
            const ctx = contextStore.getContext(request);
            const id = ctx.requestId as string | undefined;
            if (id) {
              set.headers[requestIdHeaderName] = id;
            }
          }

          // 如果已自定义记录日志(per-instance logger 或 globalLogger),跳过自动访问日志
          if (
            requestHasCustomLog.has(request) ||
            globalCustomLoggedRequests.has(request)
          ) {
            return;
          }

          // 记录访问日志
          const status =
            set.status === undefined || set.status === null
              ? 200
              : getStatusCode(set.status);
          const accumulated = contextStore.getContext(request);
          const data: Record<string, unknown> = { status };
          if (Object.keys(accumulated).length > 0) {
            data.context = { ...accumulated };
          }

          const beforeTime = requestStartTimes.get(request) ?? BigInt(0);
          logger.log(getLogLevelForStatus(status), request, data, {
            beforeTime,
          });
        } finally {
          // 清理请求状态，防止内存泄漏
          requestStartTimes.delete(request);
          contextStore.clearContext(request);
        }
      })

      // 单点错误处理器:只记录日志,不 return value,让错误继续传播
      .error(logOnErrorHook)
      .as("global")
  );
};

/**
 * 插件返回类型
 * @public
 */
export type CreateElogs = ReturnType<typeof createElogs>;
