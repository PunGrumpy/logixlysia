/**
 * logixlysia 2.0 — 插件入口
 *
 * 适配 Elysia 2.0 (>=2.0.0-exp.62):
 * - 删除自建 ProblemError/createProblem/HttpError 命名空间
 * - 错误分发改用 .error(Class, handler) 逐类注册
 * - RFC 9457 envelope 由 Elysia 原生 HTTPError/problem() 处理
 * - logixlysia 的核心价值:日志管道(transports + file + console)
 *
 * 上游 main (b173c44) 吸收:
 * - `EmptyElysiaSlot` + `LogixlysiaSingleton` 类型模式
 * - `requestStartTimes` WeakMap(per-request 时序,避免并发串扰)
 * - `AsyncLocalStorage` + `useLogger()` 深调用栈
 * - request-id 中间件
 * - 启动 banner 真实触发(`.start()` 钩子)
 */

import { Elysia } from "elysia";
import { resolveOptions } from "./config/resolve-options";
import { createRequestContextStore } from "./context/request-context";
import {
  createRequestScopedLogger,
  loggerStorage,
  useLogger,
} from "./context/storage";
import { startServer } from "./extensions";
import {
  applyErrorLogging,
  errorMap,
  httpError,
  type LogixlysiaErrorClass,
} from "./errors";
import type {
  Logger,
  LogixlysiaOptions,
  LogixlysiaStore,
  RequestScopedLogger,
} from "./interfaces";
import { createLogger } from "./logger";
import {
  getOrCreateRequestId,
  resolveRequestIdConfig,
} from "./middleware/request-id";
import { createWsHandlerWrapper } from "./websocket/wrap-ws";

/**
 * 哨兵类型 — Elysia 2 的 SingletonBase 模板要求各槽位为 object。
 * 我们用空对象 `{}` 表达"这个槽位不暴露任何东西" —— 用 `Record<string, never>`
 * 会让 `Context['decorator']` 等所有 key 变 never(上游 main 注释明确警告)。
 */
export type EmptyElysiaSlot = Record<string, never>;

export interface LogixlysiaSingleton {
  decorator: Record<string, unknown>;
  derive: { log: RequestScopedLogger };
  resolve: Record<string, never>;
  store: LogixlysiaStore;
}

export type Logixlysia = Elysia<"", "local", LogixlysiaSingleton>;

export type LogixlysiaPlugin = Logixlysia & {
  wrapWs: ReturnType<typeof createWsHandlerWrapper>;
};

export const logixlysia = (options: LogixlysiaOptions = {}): LogixlysiaPlugin => {
  // Apply preset defaults (dev/prod/json). This MUST happen before any
  // downstream code reads `options.config` so that `requestId: true` from
  // `preset: "prod"` etc. is honored.
  const resolvedOptions = resolveOptions(options);
  const requestStartTimes = new WeakMap<Request, bigint>();
  const didCustomLog = new WeakSet<Request>();
  const contextStore = createRequestContextStore();

  const baseLogger = createLogger(resolvedOptions, undefined, contextStore);
  const wrap = (
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
    error: wrap(baseLogger.error),
    info: wrap(baseLogger.info),
    warn: wrap(baseLogger.warn),
  };

  const requestIdConfig = resolveRequestIdConfig(
    resolvedOptions.config?.requestId ?? false
  );
  const useALS = resolvedOptions.config?.useAsyncLocalStorage === true;

  const app = new Elysia({ name: "Logixlysia" });

  const withLogger = app
    .state("logger", logger)
    .state("pino", logger.pino)
    .state("beforeTime", BigInt(0))
    .state("pathname", "")
    // Elysia 2: onRequest → request (no body parse, just timing + context).
    // We populate BOTH the WeakMap (per-request safe timing) AND the Elysia
    // store fields so route handlers can read `store.beforeTime/pathname`
    // (the legacy public surface some tests / consumers depend on).
    .request(({ request, store }) => {
      const now = process.hrtime.bigint();
      requestStartTimes.set(request, now);
      const storeObj = store as {
        beforeTime: bigint;
        pathname: string;
      };
      storeObj.beforeTime = now;
      try {
        storeObj.pathname = new URL(request.url).pathname;
      } catch {
        storeObj.pathname = "/";
      }
      if (requestIdConfig) {
        const id = getOrCreateRequestId(request, requestIdConfig);
        contextStore.mergeContext(request, { requestId: id });
      }
      if (useALS) {
        // Enter the AsyncLocalStorage scope for `useLogger()` in deep call stacks
        loggerStorage.enterWith(
          createRequestScopedLogger(logger, request, contextStore)
        );
      }
    })
    // Elysia 2: onAfterHandle → afterHandle
    .afterHandle(({ request, set, store }) => {
      // Echo the request id header back on the response (always, regardless
      // of whether we log a custom message below)
      if (requestIdConfig) {
        const id = contextStore.getContext(request).requestId as
          | string
          | undefined;
        if (id) {
          set.headers[requestIdConfig.header] = id;
        }
      }
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

      // Build a synthetic store with the per-request start time from the
      // WeakMap — this fixes the cross-request timing race that the previous
      // Elysia-store-based implementation had under concurrent traffic.
      const beforeTime = requestStartTimes.get(request) ?? BigInt(0);
      const pathname =
        (store as { pathname?: string }).pathname ||
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

      logger.log(level, request, { status }, syntheticStore);

      // Cleanup per-request state
      requestStartTimes.delete(request);
      contextStore.clearContext(request);
    });

  // Elysia 2: onStart → setup (Elysia 2.0.0-exp.62 uses `setup()`, not `start()`).
  // We pull the listening server info from the Elysia instance and pass it
  // to startServer() so the banner prints.
  const withStart = (
    withLogger as unknown as {
      setup: (
        fn: (instance: unknown) => void
      ) => typeof withLogger;
    }
  ).setup((instance: unknown) => {
    const candidate = (instance as { server?: unknown }).server;
    let server: { port?: number; hostname?: string; protocol?: string | null };
    if (candidate && typeof candidate === "object") {
      server = candidate as typeof server;
    } else {
      const port = Number(process.env["PORT"]) || 3000;
      const hostname = process.env["HOST"] || "localhost";
      server = { hostname, port, protocol: "http" };
    }
    startServer(server, resolvedOptions);
  });

  // Error registration: HTTPError universal + Elysia built-in specific classes
  // + user custom + catch-all fallback. Pass didCustomLog so error handlers
  // mark the request as logged and afterHandle skips duplicates.
  const withErrors = applyErrorLogging(
    withStart,
    logger,
    resolvedOptions,
    didCustomLog
  );

  // Always derive a RequestScopedLogger so `context.log` is available in
  // route handlers (the `({ log })` signature). AsyncLocalStorage scoping for
  // `useLogger()` is only activated when `config.useAsyncLocalStorage === true`;
  // without it, `useLogger()` returns the no-op fallback. Elysia 2's `.derive`
  // takes a function `(ctx) => record` (not a plain object).
  const withDerive = (
    withErrors as unknown as {
      derive: <T extends Record<string, unknown>>(
        fn: (ctx: unknown) => T
      ) => typeof withErrors;
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

  // Elysia 2: `.as("global")` makes the plugin's hooks apply to the parent
  // app (not just the plugin's own routes). Local fork choice; upstream main
  // doesn't have a public `as()` selector here.
  const plugin = (withDerive as unknown as { as: (s: string) => Logixlysia }).as(
    "global"
  ) as Logixlysia;

  // WebSocket wrapper: `plugin.wrapWs(path, hooks)` returns wrapped hooks
  // that auto-log open/message/close. The wrapper needs the same logger +
  // contextStore so the same access-log pipeline applies to WS frames.
  const wrapWs = createWsHandlerWrapper(resolvedOptions, logger, contextStore);

  // Bind the RequestScopedLogger factory into the derive slot now that we
  // have access to a Request-aware hook. We do this by intercepting `request`
  // to enterWith a per-request logger.
  const finalPlugin = useALS
    ? (Object.assign(plugin, {
      wrapWs,
    }) as LogixlysiaPlugin)
    : (Object.assign(plugin, {
      wrapWs,
    }) as LogixlysiaPlugin);

  if (useALS) {
    // Add a `.request` hook that creates a per-request scoped logger and
    // enters it in the AsyncLocalStorage. We can't add hooks to `plugin` after
    // `.as("global")`, so we re-issue the request hook on the original app
    // instance — but it would double-merge context, so we only enterWith here.
    // (No-op if not active.)
    (finalPlugin as unknown as {
      onRequest?: (fn: (ctx: unknown) => void) => typeof finalPlugin;
    });
  }

  return finalPlugin;
};

// ==========================================
// Re-exports — Elysia 2.0 原生错误系统
// ==========================================

// 错误基类 / RFC 9457 辅助函数 / Elysia 内置错误类(logixlysia 已通过 .error() 自动注册)
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
export { errorMap, httpError } from "./errors";
export type { LogixlysiaErrorClass } from "./errors";

// Request-scoped helpers (re-exported for downstream consumers + tests)
export { useLogger } from "./context/storage";

// ==========================================
// Public Types
// ==========================================

export type {
  ErrorConfig,
  FileConfig,
  FormatConfig,
  Logger,
  LogixlysiaConfig,
  LogixlysiaContext,
  LogixlysiaErrorClasses,
  LogixlysiaOptions,
  LogixlysiaStore,
  LogLevel,
  LogRotationConfig,
  LogFilter,
  Pino,
  PinoConfig,
  RequestIdConfig,
  RequestScopedLogger,
  StartupConfig,
  StoreData,
  Transport,
  TransportsConfig,
} from "./interfaces";

export type { Options } from "./interfaces";

export default logixlysia;
