/**
 * logixlysia 2.0 — Elysia 2 日志插件（函数式插件）
 *
 * 核心能力：
 * - 请求/响应访问日志（根据状态码自动选择 INFO/WARNING/ERROR）
 * - 请求 ID 追踪（X-Request-Id 头透传 + 回显）
 * - 慢请求检测与标记
 * - 请求级上下文累积（mergeContext）
 * - WebSocket 生命周期日志（通过 `createWsHandlerWrapper` 单独提供）
 * - AsyncLocalStorage 透传（`useLogger()` 获取请求作用域 logger）
 * - 预设配置（dev / prod / json）+ 自定义预设（`registerPreset`）
 * - Pino 集成（`store.pino` + 透传 pino options）
 * - 文件日志 + 日志轮转
 * - 4 层错误处理器注册：HTTPError 通用 + Elysia 内置 + 用户自定义 + 兜底
 *
 * 设计原则：遵循 Elysia 2 官方推荐的函数式插件写法 —— `return new Elysia()...`
 * 单一链式调用，让 TypeScript 自行推断返回类型。brand 来自 elysia 模块内部，
 * `.use()` 无需任何 `as` / `any` / `@ts-expect-error` 妥协。
 *
 * 依赖方向：
 *   用户代码  →  createLogPlugin(options)          →  Elysia 插件
 *   用户代码  →  createWsHandlerWrapper(...)       →  WebSocket hooks 工厂
 *   用户代码  →  errorMap(...) / httpError()       →  自定义 HTTPError 类
 *
 * 注意事项：
 * 不要在插件实例上挂载额外方法（如 `.wrapWs` 之类）：Elysia 2 的 `#private` brand
 * 与"实例上挂字段"存在结构性冲突，会导致 `.use()` 报类型错误。`wrapWs` 已作为
 * 独立导出提供，请直接使用。
 */

import {
  type AnyElysia,
  Elysia,
  type ErrorContext,
  HTTPError,
  type HTTPHeaders,
  InternalServerError,
  InvalidCookie,
  NotFound,
  ParseError,
  problem,
  type StatusMap,
  ValidationError,
} from "elysia";
import { ErrorHandler } from "elysia/types";
// 导入全局 Logger 管理
import { initGlobalLogger } from "./$log";
import { resolveOptions } from "./config/resolve-options";
import { createRequestContextStore } from "./context/request-context";
import { loggerStorage } from "./context/storage";
import { startServer } from "./extensions";
import { getStatusCode } from "./helpers/status";
import type {
  Logger,
  LogixlysiaOptions,
  LogixlysiaStore,
  LogLevel,
  RequestScopedLogger,
} from "./interfaces";
import { createLogger } from "./logger";
import {
  getOrCreateRequestId,
  type ResolvedRequestIdConfig,
  resolveRequestIdConfig,
} from "./middleware/request-id";

// ============================================================
// 类型定义
// ============================================================
/**
 * Elysia 2 单例接口 —— 注入到 Elysia 的 store / derive 中的类型定义。
 *
 * 关闭了 Elysia `SingletonBase.store` 的 `Record<string, unknown>` 索引签名
 * （我们使用 `LogixlysiaStore` 显式列举字段，合并后的 context / ws.data 能保持
 * 精确推断，不会退化成 `any`）。`resolve` 槽位在 Elysia 2 中已被移除，不再导出。
 */
export interface LogixlysiaSingleton {
  decorator: Record<string, never>;
  derive: { log: RequestScopedLogger };
  store: LogixlysiaStore;
}

// ============================================================
// 主插件函数
// ============================================================

export const createLogPlugin = (rawOptions: LogixlysiaOptions = {}) => {
  // ---------- 1. 初始化 per-instance 状态 ----------
  const options = resolveOptions(rawOptions);
  const requestHasCustomLog = new WeakSet<Request>();
  const requestStartTimes = new WeakMap<Request, bigint>();
  const contextStore = createRequestContextStore();
  const baseLogger = createLogger(options, undefined, contextStore);

  // 初始化全局 Logger（使用独立的上下文存储）
  initGlobalLogger(options);

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
   * 从任意错误对象中提取状态码
   * `error.status` 可能是 number 或 `keyof StatusMap`
   */
  const extractStatusCode = (error: unknown): number | undefined => {
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

  // ---------- 4. 错误处理器工厂 ----------
  /**
   * 创建特定错误类的处理器
   *
   * @param includeValidationDetails - 是否展开 `error.all`（Elysia 2 附加到
   *   ValidationError / ParseError 的字段级验证错误数组）
   *   - `true`  → 用于 Elysia 内置错误类（Validation/NotFound/Parse/ISE/InvalidCookie）
   *   - `false` → 用于用户自定义 HTTPError 子类 + HTTPError 通用处理器
   *
   * Elysia 2 将 error 放在 ctx 上（ErrorHandler 的 ctx 类型中包含 `error` 字段）。
   * 静态层使用 Elysia 的 ErrorContext，error / store / set 的具体类型通过内层
   * 窄化为 logixlysia 所需的形态。`ErrorHandler` 让 Elysia 接受此函数作为
   * `.error()` 的处理器，无需在调用点进行类型转换。
   */
  const createErrorHandler =
    (includeValidationDetails: boolean): ErrorHandler =>
    (ctx) => {
      const { request, error, store, set } = ctx as ErrorContext & {
        error: unknown;
        store: LogixlysiaStore;
        set: { headers: HTTPHeaders; status?: number | keyof StatusMap };
      };
      requestHasCustomLog.add(request);

      // 提取状态码
      const status = getStatusCode(
        extractStatusCode(error) ??
          (error instanceof HTTPError ? error.status : 500)
      );
      const data: Record<string, unknown> = { status };

      // 构建错误数据
      if (error instanceof HTTPError) {
        data.type = error.type;
        data.message = error.message ?? error.detail;
      } else {
        data.message = error instanceof Error ? error.message : String(error);
      }

      // 包含验证详情（用于 ValidationError / ParseError）
      if (
        includeValidationDetails &&
        error &&
        typeof error === "object" &&
        "all" in error
      ) {
        const { all } = error as { all?: unknown };
        if (Array.isArray(all)) {
          data.errors = all.map((e) => {
            const errObj = e as Record<string, unknown>;
            return {
              field:
                (typeof errObj.instancePath === "string"
                  ? errObj.instancePath
                  : typeof errObj.path === "string"
                    ? errObj.path
                    : ""
                ).replace(/^\//, "") || undefined,
              message:
                (errObj.summary as string | undefined) ??
                (errObj.message as string | undefined) ??
                "Validation error",
            };
          });
        }
      }

      // 记录错误日志
      logger.log(getLogLevelForStatus(status), request, data, store);

      // 详细错误日志（开发环境开启 verbose 时）
      if (includeValidationDetails && verboseErrorLogging) {
        const errStr = JSON.stringify(error, null, 2);
        logger.warn(request, "Verbose error context", { error: errStr });
      }

      setResponseRequestId(request, set);
    };

  /**
   * 兜底错误处理器：处理未被任何特定错误类匹配的错误
   */
  const fallbackErrorHandler: ErrorHandler = (ctx) => {
    const { request, error, store, set } = ctx as ErrorContext & {
      error: unknown;
      store: LogixlysiaStore;
      set: { headers: HTTPHeaders; status?: number | keyof StatusMap };
    };

    // 如果是 HTTPError，已被特定处理器处理，这里只做兜底响应
    if (error instanceof HTTPError) {
      return;
    }

    requestHasCustomLog.add(request);
    const status = extractStatusCode(error) ?? 500;
    const logErrorPayload = options.config?.logErrorPayload === true;
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    const payload = logErrorPayload && error ? { error: String(error) } : {};

    logger.log(
      getLogLevelForStatus(status),
      request,
      { message, status, ...payload },
      store
    );

    set.status = status;
    set.headers = {
      ...set.headers,
      "content-type": "application/problem+json",
    };
    setResponseRequestId(request, set);
    return problem(status, { detail: message });
  };

  // ---------- 5. 用户自定义错误插件 ----------
  /**
   * 构建用户自定义 HTTPError 类的错误处理插件
   *
   * 原因：Elysia 2 的 `.error(E, fn)` 每次调用都会改变返回类型
   * （`error: [...prev, new]`），直接使用 `let app = app.error(...)`
   * 会被 TypeScript 拒绝，违反"无 as"约束。
   *
   * 解决方案：将动态部分拆分为独立的子插件，再通过 `.use()` 合并回主插件。
   * 这是 Elysia 2 官方推荐的做法 —— 插件组合天然支持类型合并，无需任何类型转换。
   */
  let userErrorHandlers: AnyElysia = new Elysia({
    name: "LogixlysiaUserErrors",
  });
  for (const cls of options.errors ?? []) {
    userErrorHandlers = userErrorHandlers.error(cls, createErrorHandler(false));
  }

  // ---------- 6. 返回 Elysia 插件（单一链式调用） ----------
  return (
    new Elysia({ name: "Logixlysia" })
      // 初始化状态
      .state("logger", logger)
      .state("pino", logger.pino)
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

        // AsyncLocalStorage 支持
        // Elysia 2 在 hook 链路上有自己的 async scope，这里 enterWith
        // 设置的值会透传到 handler / afterHandle，只要 Elysia 不在中间
        // 额外调用 `als.run()`（Elysia 2.x 当前不会，升级时需回归测试）
        if (useAsyncLocalStorage) {
          loggerStorage.enterWith(createRequestScopedLogger(request));
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

          // 如果已自定义记录日志，跳过自动访问日志
          if (requestHasCustomLog.has(request)) {
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

      // 错误处理器注册（优先级从高到低）
      .error(HTTPError, createErrorHandler(false))
      .error(ValidationError, createErrorHandler(true))
      .error(NotFound, createErrorHandler(true))
      .error(ParseError, createErrorHandler(true))
      .error(InternalServerError, createErrorHandler(true))
      .error(InvalidCookie, createErrorHandler(true))
      .error(fallbackErrorHandler)

      // 用户自定义错误
      .use(userErrorHandlers)

      .as("global")
  );
};

/**
 * 插件返回类型
 */
export type Logixlysia = ReturnType<typeof createLogPlugin>;

/**
 * 向后兼容别名：保留旧的函数名
 * @deprecated 请使用 `createLogPlugin`，该别名将在未来版本中移除
 */
export const logixlysia = createLogPlugin;
