/**
 * logixlysia 2.0 — 错误日志桥接层
 *
 * Elysia 2.0 推荐用 `.error(Class, handler)` 逐类注册,而不是 1.x 的单一 onError。
 * 本文件把"给一个 app 装上 logixlysia 错误日志"这件事抽成一个函数,
 * 对 Elysia 内置错误类(HTTPError 通用 + ValidationError/NotFound 等具体类)、
 * 用户自定义类、未匹配兜底,做四层处理。
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
import type {
  Logger,
  LogixlysiaOptions,
  LogLevel,
  StoreData,
} from "./interfaces";

/** HTTPError 子类 —— logixlysia 通过它知道哪些用户类需要 .error() 注册 */
export type LogixlysiaErrorClass = TaggedHTTPError<string, any>;

/**
 * Elysia 错误实例 → logixlysia 日志级别
 * 4xx → WARNING,5xx → ERROR,其他 → INFO
 */
const levelForStatus = (status?: number | keyof StatusMap): LogLevel => {
  const numeric = typeof status === "number" ? status : 500;
  if (numeric >= 500) return "ERROR";
  if (numeric >= 400) return "WARNING";
  return "INFO";
};

/** 内部:从任意 error 中提取 status 数字 */
const extractStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return status;
  if (typeof status === "string") {
    const known: Record<string, number> = {
      "Bad Request": 400,
      Unauthorized: 401,
      Forbidden: 403,
      "Not Found": 404,
      Conflict: 409,
      "Unprocessable Content": 422,
      "Internal Server Error": 500,
      "Bad Gateway": 502,
      "Service Unavailable": 503,
    };
    return (
      known[status] ?? (status.toLowerCase().includes("error") ? 500 : 400)
    );
  }
  return undefined;
};

/** 内部:从 error 提取 RFC 9457 友好字段 */
const extractErrorFields = (error: unknown) => {
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
  // 标记本请求已由 logixlysia 记录,afterHandle 看到就不再记一次
  const markLogged = (request: Request) => {
    if (didCustomLog) {
      didCustomLog.add(request);
    }
  };

  // 1. HTTPError 通用 handler(任何 HTTPError 派生类)
  app.error(HTTPError, (ctx: any) => {
    const { request, error, store } = ctx;
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
      const { request, error, store } = ctx;
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
      return undefined;
    });
  }

  // 3. 用户提供的自定义 HTTPError 类
  for (const cls of options.errors ?? []) {
    app.error(cls, (ctx: any) => {
      const { request, error, store } = ctx;
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
      return undefined;
    });
  }

  // 4. 兜底:捕获所有未匹配错误。
  // Elysia 2.0 删除了 onError 钩子,改用 .error(fn)(单函数参数走 case 1 的 onBranch 分支)。
  // 注意:这个 handler 对所有 error 都会跑(不只是兜底),所以 HTTPError 已经被 class handler
  // 记过的,这里要跳过避免重复日志。
  app.error((ctx: any) => {
    const { request, error, store, set } = ctx;
    if (error instanceof HTTPError) {
      // 已被 class-specific handler 处理过日志,这里只兜底响应体
      return undefined;
    }
    markLogged(request);
    const status = extractStatus(error) ?? 500;
    const message = error instanceof Error ? error.message : String(error);

    logger.log(
      levelForStatus(status),
      request,
      {
        status,
        error: message,
      },
      store as StoreData
    );

    set.status = status;
    set.headers = {
      ...(set.headers ?? {}),
      "content-type": "application/problem+json",
    };
    return problem(status, { detail: message });
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
