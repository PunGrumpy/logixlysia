/**
 * logixlysia 2.0 — 统一错误模块
 *
 * 合并自原 `error-map.ts` (258 行, RFC 9457 + applyErrorLogging 4 层注册) +
 * 原 `evelyn-error.ts` (56 行, httpError 工厂)
 *
 * 提供:
 * - `applyErrorLogging` — 把 logixlysia 错误日志挂到 Elysia app 上(HTTPError 通用 +
 *   Elysia 内置具体类 + 用户自定义 + 兜底 onError)
 * - `errorMap` — 数据库错误码 → HTTPError 类的工厂
 * - `httpError` — 函数式 HTTPError 工厂(用户用,一行抛出)
 * - `extractStatus` / `extractErrorFields` / `levelForStatus` — 内部辅助
 */

import {
  HTTPError,
  InternalServerError,
  InvalidCookie,
  NotFound,
  ParseError,
  problem,
  type StatusMap,
  type TaggedHTTPError,
  ValidationError,
} from "elysia";
import { getStatusCode } from "./helpers/status";
import type {
  Logger,
  LogixlysiaOptions,
  LogLevel,
  StoreData,
} from "./interfaces";
import { normalizeLoggedError } from "./utils/error";

/** HTTPError 子类 —— logixlysia 通过它知道哪些用户类需要 .error() 注册 */
export type LogixlysiaErrorClass = TaggedHTTPError<string, any>;

/**
 * Elysia 错误实例 → logixlysia 日志级别
 * 4xx → WARNING,5xx → ERROR,其他 → INFO
 */
export const levelForStatus = (
  status?: number | keyof StatusMap
): LogLevel => {
  const numeric = typeof status === "number" ? status : 500;
  if (numeric >= 500) {
    return "ERROR";
  }
  if (numeric >= 400) {
    return "WARNING";
  }
  return "INFO";
};

/** 内部:从任意 error 中提取 status 数字 */
export const extractStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return status;
  }
  if (typeof status === "string") {
    const known: Record<string, number> = {
      "Bad Request": 400,
      Conflict: 409,
      Forbidden: 403,
      "Bad Gateway": 502,
      "Internal Server Error": 500,
      "Not Found": 404,
      "Service Unavailable": 503,
      Unauthorized: 401,
      "Unprocessable Content": 422,
    };
    return (
      known[status] ?? (status.toLowerCase().includes("error") ? 500 : 400)
    );
  }
  return undefined;
};

/** 内部:从 error 提取 RFC 9457 友好字段 */
export const extractErrorFields = (error: unknown) => {
  if (typeof error !== "object" || error === null) {
    return {
      type: undefined,
      message: String(error),
      status: undefined,
    };
  }
  const e = error as Record<string, unknown>;
  return {
    type: typeof e.type === "string" ? e.type : undefined,
    message: e.message as string | undefined,
    status: extractStatus(error),
  };
};

/**
 * 给一个 Elysia app 装上 logixlysia 错误日志。
 *
 * 工作方式:
 * 1. 注册 HTTPError 通用 handler → 任何 HTTPError 派生类都自动写日志
 * 2. 注册 Elysia 内置具体类
 * 3. 注册用户提供的 LogixlysiaOptions.errors
 * 4. 兜底 onError:捕获所有未匹配错误
 */
export const applyErrorLogging = <T extends { error: any; onError?: any }>(
  app: T,
  logger: Logger,
  options: LogixlysiaOptions,
  didCustomLog?: WeakSet<Request>
): T => {
  const verbose = options.error?.verbose === true;
  const markLogged = (request: Request) => {
    if (didCustomLog) {
      didCustomLog.add(request);
    }
  };
  // Echo the request id header back on the response. Reads the bag via the
  // logixlysia context store; `peekContext` is non-mutating so we don't
  // accidentally keep the entry alive after the request finishes.
  const echoRequestId = (
    request: Request,
    set?: { headers?: Record<string, string> }
  ): void => {
    const id = logger.getContext(request).requestId as string | undefined;
    if (id && set) {
      set.headers = {
        ...(set.headers ?? {}),
        "X-Request-Id": id,
      };
    }
  };

  // 1. HTTPError 通用 handler(任何 HTTPError 派生类)
  app.error(HTTPError, (ctx: any) => {
    const { request, error, store, set } = ctx;
    markLogged(request);
    const fields = extractErrorFields(error);
    const status = fields.status ?? 500;
    logger.log(
      levelForStatus(status),
      request,
      {
        status,
        type: fields.type,
        message: fields.message,
      },
      store as StoreData
    );
    echoRequestId(request, set);
    return undefined;
  });

  // 2. Elysia 内置具体类
  const builtInClasses: LogixlysiaErrorClass[] = [
    ValidationError as unknown as LogixlysiaErrorClass,
    NotFound as unknown as LogixlysiaErrorClass,
    ParseError as unknown as LogixlysiaErrorClass,
    InternalServerError as unknown as LogixlysiaErrorClass,
    InvalidCookie as unknown as LogixlysiaErrorClass,
  ];

  for (const cls of builtInClasses) {
    app.error(cls, (ctx: any) => {
      const { request, error, store, set } = ctx;
      markLogged(request);
      const fields = extractErrorFields(error);
      const status = fields.status ?? 500;
      const data: Record<string, unknown> = {
        status,
        type: fields.type,
        message: fields.message,
      };
      if (error && typeof error === "object" && "all" in error) {
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
      logger.log(levelForStatus(status), request, data, store as StoreData);
      if (verbose) {
        const errStr = JSON.stringify(error, null, 2);
        logger.warn(request, "Verbose error context", { error: errStr });
      }
      echoRequestId(request, set);
      return undefined;
    });
  }

  // 3. 用户提供的自定义 HTTPError 类
  for (const cls of options.errors ?? []) {
    app.error(cls, (ctx: any) => {
      const { request, error, store, set } = ctx;
      markLogged(request);
      const fields = extractErrorFields(error);
      const status = fields.status ?? 500;
      logger.log(
        levelForStatus(status),
        request,
        {
          status,
          type: fields.type,
          message: fields.message,
        },
        store as StoreData
      );
      echoRequestId(request, set);
      return undefined;
    });
  }

  // 4. 兜底:捕获所有未匹配错误。
  app.error((ctx: any) => {
    const { request, error, store, set } = ctx;
    if (error instanceof HTTPError) {
      // 已被 class-specific handler 处理过日志,这里只兜底响应体
      return undefined;
    }
    markLogged(request);
    const status = extractStatus(error) ?? 500;
    const logErrorPayload = options.config?.logErrorPayload === true;
    const normalized = normalizeLoggedError(error, logErrorPayload);

    logger.log(
      levelForStatus(status),
      request,
      {
        status,
        error: normalized.error,
        message: normalized.message,
      },
      store as StoreData
    );

    set.status = status;
    set.headers = {
      ...(set.headers ?? {}),
      "content-type": "application/problem+json",
    };
    echoRequestId(request, set);
    return problem(status, { detail: normalized.message });
  });

  return app;
};

/**
 * 数据库错误码 → HTTPError 类的工厂
 *
 * 保留 1.x `ErrorMapping.errorMap` 的语义,但用 Elysia 2.0 原生类表达。
 *
 * @example
 * ```ts
 * new Elysia().use(logixlysia({
 *   errors: errorMap({
 *     "23505": { status: 409, title: "Duplicate Key" },
 *     "23503": { status: 400, title: "Foreign Key Violation" },
 *   }),
 * }))
 * ```
 */
export const errorMap = (
  map: Record<string, { status: number; title: string; type?: string }>
): LogixlysiaErrorClass[] => {
  return Object.entries(map).map(([slug, { status, title, type }]) => {
    const finalType = type ?? slug;
    class MappedHTTPError extends HTTPError {
      override readonly status: number = status;
      override readonly type: string = finalType;
      readonly problemTitle: string = title;
    }
    return MappedHTTPError as unknown as LogixlysiaErrorClass;
  });
};

// ==========================================
// httpError — 函数式 HTTPError 工厂
// ==========================================

const normalizeStatus = (status: number | keyof StatusMap): number => {
  if (typeof status === "number") {
    return status;
  }
  return getStatusCode(status);
};

const httpErrorType = (status: number): string =>
  `https://httpstatuses.com/${status}`;

/**
 * 创建一个 HTTPError 实例,匿名类继承避免污染全局命名空间。
 *
 * @example
 * ```ts
 * throw httpError(404, "user not found", { userId: 42 });
 * // → 响应 404 + application/problem+json + logixlysia 写一条 WARNING 日志
 * ```
 */
export const httpError = (
  status: number | keyof StatusMap,
  detail?: string,
  extensions?: Record<string, unknown>
): HTTPError => {
  const numericStatus = normalizeStatus(status);
  const finalDetail = detail;
  const finalExtensions = extensions;

  // 匿名类 —— 每次调用都是新类,避免 class 标识冲突
  class AnonymousHTTPError extends HTTPError {
    override readonly status: number = numericStatus;
    override readonly type: string = httpErrorType(numericStatus);
    override detail(): unknown {
      // extensions 作为 detail 的对象值(Elysia 2.0 允许 detail 是对象)
      if (finalExtensions !== undefined) {
        return {
          ...finalExtensions,
          ...(finalDetail ? { message: finalDetail } : {}),
        };
      }
      return finalDetail;
    }
  }

  return new AnonymousHTTPError(detail);
};
