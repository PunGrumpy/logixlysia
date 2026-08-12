/**
 * logixlysia 2.0 — Elysia 2 日志插件(函数 plugin)
 *
 * 核心能力:
 * - 请求/响应 access log(自动 INFO / WARNING / ERROR 按状态码)
 * - 请求 ID(X-Request-Id 头透传 + 回显)
 * - 慢请求徽章
 * - per-request context 累积(mergeContext)
 * - WebSocket 生命周期日志(通过 `createWsHandlerWrapper` 单独提供)
 * - AsyncLocalStorage 透传(`useLogger()` 拿请求作用域 logger)
 * - 预设(dev / prod / json)+ 自定义 preset(`registerPreset`)
 * - Pino 集成(`store.pino` + 透传 pino options)
 * - 文件日志 + 轮转
 * - 4 层 .error() 注册:HTTPError 通用 + Elysia 内置 + 用户自定义 + 兜底
 *
 * 设计:按 Elysia 2 官方推荐函数 plugin 写法 —— `return new Elysia()...` 单一
 * 链式,让 TS 自己推断返回类型,brand 来自 elysia 模块内部,`.use()` 无需
 * 任何 `as` / `any` / `@ts-expect-error` 妥协。
 *
 * 依赖的方向:
 *   用户代码  →  logixlysia(options)        →  Elysia plugin
 *   用户代码  →  createWsHandlerWrapper(...) →  ws hooks 工厂
 *   用户代码  →  errorMap(...) / httpError() →  自定义 HTTPError 类
 *
 * 不要在 plugin 实例上挂额外方法(`.wrapWs` 之类):Elysia 2 的 `#private` brand
 * 跟"实例上挂字段"结构性冲突,会让 `.use()` 报 type error。`wrapWs` 已经作为
 * 独立 export 提供。
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
  resolveRequestIdConfig,
  type ResolvedRequestIdConfig,
} from "./middleware/request-id";
import { ErrorHandler } from "elysia/types";

/**
 * Elysia 2 singleton —— 注入到 Elysia 的 store / derive 形状。
 *
 * 关闭了 Elysia `SingletonBase.store` 的 `Record<string, unknown>` 索引签名
 * (我们用 `LogixlysiaStore` 显式列举字段,合并后的 context / ws.data 能保持
 * 精确推断,不会退化成 `any`)。`resolve` 槽位在 Elysia 2 中已被移除,不导出。
 */
export interface LogixlysiaSingleton {
  decorator: Record<string, never>;
  derive: { log: RequestScopedLogger };
  store: LogixlysiaStore;
}

/**
 * 插件返回类型 —— `ReturnType<typeof logixlysia>`,Elysia 自己推断。
 * 不手写 `Elysia<...>` 泛型,避免与 elysia 模块的 `#private` brand 冲突。
 */
export type Logixlysia = ReturnType<typeof logixlysia>;

// ============================================================
// 主函数
// ============================================================

export const logixlysia = (rawOptions: LogixlysiaOptions = {}) => {
  // ---------- 1. 准备 per-instance 状态 ----------
  const options = resolveOptions(rawOptions);
  const didCustomLog = new WeakSet<Request>();
  const requestStartTimes = new WeakMap<Request, bigint>();
  const contextStore = createRequestContextStore();
  const baseLogger = createLogger(options, undefined, contextStore);

  // 包装 logger: 调一次便利方法 = 标记 "已自定义记录",afterHandle 跳过自动 access log
  const wrap =
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
        didCustomLog.add(request);
        fn(request, message, context);
      };
  const logger: Logger = {
    ...baseLogger,
    debug: wrap(baseLogger.debug),
    error: wrap(baseLogger.error),
    info: wrap(baseLogger.info),
    warn: wrap(baseLogger.warn),
  };

  const requestIdConfig: ResolvedRequestIdConfig | null = resolveRequestIdConfig(
    options.config?.requestId
  );
  const useALS = options.config?.useAsyncLocalStorage === true;
  const verbose = options.error?.verbose === true;
  const requestIdHeader = requestIdConfig?.header ?? "X-Request-Id";

  // ---------- 2. per-request scoped logger 工厂 ----------
  const createRSL = (request: Request): RequestScopedLogger => ({
    debug: (message, context) => logger.debug(request, message, context),
    error: (message, context) => logger.error(request, message, context),
    info: (message, context) => logger.info(request, message, context),
    mergeContext: (partial) => contextStore.mergeContext(request, partial),
    warn: (message, context) => logger.warn(request, message, context),
  });

  // ---------- 3. 错误处理辅助 ----------
  /**
   * 把当前请求的 requestId 写到响应头。`set` 来自 Elysia 2 的
   * `ContextBase.set`(HTTPHeaders),不是泛 Record。
   */
  const echoRequestId = (
    request: Request,
    set?: { headers: HTTPHeaders }
  ): void => {
    if (!requestIdConfig) {
      return;
    }
    const id = contextStore.getContext(request).requestId as
      | string
      | undefined;
    if (id && set) {
      set.headers = {
        ...set.headers,
        [requestIdHeader]: id,
      };
    }
  };

  /** 状态码 → logixlysia 日志级别(数字归一化后)。 */
  const levelForStatus = (status: number): LogLevel => {
    if (status >= 500) {
      return "ERROR";
    }
    if (status >= 400) {
      return "WARNING";
    }
    return "INFO";
  };

  /** 从任意 error 提取 status 数字;`error.status` 可能是 number 或 `keyof StatusMap`。 */
  const extractStatus = (error: unknown): number | undefined => {
    if (!error || typeof error !== "object") {
      return undefined;
    }
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
    if (typeof status === "string") {
      return getStatusCode(status);
    }
    return undefined;
  };

  /**
   * Build a class-specific error handler.
   *
   * `withAll` controls whether to expand `error.all` (the array of field-level
   * validation issues Elysia 2 attaches to ValidationError / ParseError):
   * - `true`  → Elysia built-in classes (Validation/NotFound/Parse/ISE/InvalidCookie)
   * - `false` → user-defined HTTPError subclasses + HTTPError universal handler
   *
   * Elysia 2 把 error 放在 ctx 上(ErrorHandler 的 ctx 形状里有 `error` 字段)。
   * 静态层(ctx 的具体形状)用 Elysia 的 ErrorContext,error / store / set 的具体
   * 形状通过内层窄化为 logixlysia 用得到的形态。`ErrorHandler` 让 Elysia 接受
   * 这个函数作为 `.error()` 的 handler,不需要在调用点再做 cast。
   */
  const makeErrorHandler = (withAll: boolean): ErrorHandler => (ctx) => {
    const { request, error, store, set } = ctx as ErrorContext & {
      error: unknown;
      store: LogixlysiaStore;
      set: { headers: HTTPHeaders; status?: number | keyof StatusMap };
    };
    didCustomLog.add(request);

    const status = getStatusCode(
      extractStatus(error) ??
      (error instanceof HTTPError ? error.status : 500)
    );
    const data: Record<string, unknown> = { status };

    if (error instanceof HTTPError) {
      data.type = error.type;
      data.message = error.message ?? error.detail;
    } else {
      data.message = error instanceof Error ? error.message : String(error);
    }

    if (withAll && error && typeof error === "object" && "all" in error) {
      const all = (error as { all?: unknown }).all;
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

    logger.log(levelForStatus(status), request, data, store);

    if (withAll && verbose) {
      const errStr = JSON.stringify(error, null, 2);
      logger.warn(request, "Verbose error context", { error: errStr });
    }

    echoRequestId(request, set);
    return undefined;
  };

  // 兜底 catch-all 错误处理:未匹配任何 class 的错误归这里
  const fallbackErrorHandler: ErrorHandler = (ctx) => {
    const { request, error, store, set } = ctx as ErrorContext & {
      error: unknown;
      store: LogixlysiaStore;
      set: { headers: HTTPHeaders; status?: number | keyof StatusMap };
    };
    if (error instanceof HTTPError) {
      // 已被 class-specific handler 处理过日志,这里只兜底响应体
      return undefined;
    }
    didCustomLog.add(request);
    const status = extractStatus(error) ?? 500;
    const logErrorPayload = options.config?.logErrorPayload === true;
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    const payload = logErrorPayload && error ? { error: String(error) } : {};

    logger.log(
      levelForStatus(status),
      request,
      { status, message, ...payload },
      store
    );

    set.status = status;
    set.headers = {
      ...set.headers,
      "content-type": "application/problem+json",
    };
    echoRequestId(request, set);
    return problem(status, { detail: message });
  };

  // ---------- 4. 动态用户自定义 HTTPError 类 → 子 plugin ----------
  // Elysia 2 `.error(E, fn)` 每次调用返回类型都变(`error: [...prev, new]`),
  // 直接 `let app = app.error(...)` 会被 TS 拒,违反"无 as"约束。
  //
  // 解法:把动态部分拆成独立子 plugin,再 `.use()` 合回主 plugin。这是 Elysia 2
  // 官方推荐做法 —— plugin 组合天然支持类型合并,不需要任何 cast。
  let userErrorPlugin: AnyElysia = new Elysia({
    name: "LogixlysiaUserErrors",
  });
  for (const cls of options.errors ?? []) {
    userErrorPlugin = userErrorPlugin.error(cls, makeErrorHandler(false));
  }

  // ---------- 5. 单链式 Elysia(官方推荐写法) ----------
  return new Elysia({ name: "Logixlysia" })
    .state("logger", logger)
    .state("pino", logger.pino)
    .state("beforeTime", BigInt(0))
    .derive(({ request }) => ({ log: createRSL(request) }))
    .setup(({ server }) => {
      if (server) {
        startServer(server, options);
        return;
      }
      const port = Number(process.env["PORT"]) || 3000;
      const hostname = process.env["HOST"] || "localhost";
      startServer({ hostname, port, protocol: "http" }, options);
    })
    .request(({ request, store }) => {
      const now = process.hrtime.bigint();
      requestStartTimes.set(request, now);
      // 写回 Elysia store:handler / 测试可以直接拿 `store.beforeTime` 算耗时
      (store as { beforeTime?: bigint }).beforeTime = now;

      if (requestIdConfig) {
        const id = getOrCreateRequestId(request, requestIdConfig);
        contextStore.mergeContext(request, { requestId: id });
      }

      // ALS: Elysia 2 在 hook 链路上有它自己的 async scope,这里 enterWith
      // 设进去的值会透传到 handler / afterHandle,只要 Elysia 不在中间再
      // 额外 `als.run()` 一次(Elysia 2.x 当前不会,升级时回归测试)
      if (useALS) {
        loggerStorage.enterWith(createRSL(request));
      }
    })
    .afterHandle(({ request, set }) => {
      try {
        if (requestIdConfig) {
          const ctx = contextStore.getContext(request);
          const id = ctx.requestId as string | undefined;
          if (id) {
            set.headers[requestIdHeader] = id;
          }
        }

        if (didCustomLog.has(request)) {
          return;
        }

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
        logger.log(levelForStatus(status), request, data, { beforeTime });
      } finally {
        requestStartTimes.delete(request);
        contextStore.clearContext(request);
      }
    })
    .error(HTTPError, makeErrorHandler(false))
    .error(ValidationError, makeErrorHandler(true))
    .error(NotFound, makeErrorHandler(true))
    .error(ParseError, makeErrorHandler(true))
    .error(InternalServerError, makeErrorHandler(true))
    .error(InvalidCookie, makeErrorHandler(true))
    .error(fallbackErrorHandler)
    .use(userErrorPlugin)
    .as("global");
};
