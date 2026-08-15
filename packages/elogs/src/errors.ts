/**
 * createElogs 2.0 — 错误模块
 *
 * 提供:
 * - `errorMap` — 用户可选用工具,把 `{ code: { status, title } }` 字典生成
 *   HTTPError 类,需配合 Elysia 2 原生 `.error(MyClass, fn)` 链路注册
 * - `httpError` — 函数式 HTTPError 工厂(用户用,一行抛出)
 * - `extractStatus` / `levelForStatus` — 内部辅助,公开以供 translator 复用
 *
 * 设计原则:**插件只记录日志,不在此模块做任何错误响应格式化**。响应格式
 * 由用户通过 Elysia 2 原生 `.error(MyClass, fn)` 完全控制,或由 Elysia
 * 默认 `application/problem+json` 处理。
 */

import { HTTPError, type StatusMap } from "elysia";
import { getStatusCode } from "./helpers/status";
import type { LogLevel } from "./interfaces";

/**
 * Elysia 错误实例 → createElogs 日志级别
 * 4xx → WARNING,5xx → ERROR,其他 → INFO
 *
 * @internal
 */
export const levelForStatus = (status?: number | keyof StatusMap): LogLevel => {
  const numeric = typeof status === "number" ? status : 500;
  if (numeric >= 500) {
    return "ERROR";
  }
  if (numeric >= 400) {
    return "WARNING";
  }
  return "INFO";
};

/** 内部:从任意 error 中提取 status 数字
 *
 * @internal
 */
export const extractStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) {
    return;
  }
  const { status } = error as { status?: unknown };
  if (typeof status === "number") {
    return status;
  }
  if (typeof status === "string") {
    const known: Record<string, number> = {
      "Bad Gateway": 502,
      "Bad Request": 400,
      Conflict: 409,
      Forbidden: 403,
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
};

/**
 * 数据库错误码 → HTTPError 类的工厂
 *
 * 保留 1.x `ErrorMapping.errorMap` 的语义,但用 Elysia 2.0 原生类表达。
 *
 * **用途变更**:不再被插件自动注册。生成类后,用户用 Elysia 2 原生
 * `.error(MyClass, fn)` 自行注册。
 *
 * @example
 * ```ts
 * import { errorMap } from "@pori15/elogs";
 * import { problem } from "elysia";
 *
 * const errors = errorMap({
 *   "23505": { status: 409, title: "Duplicate Key" },
 *   "23503": { status: 400, title: "Foreign Key Violation" },
 * });
 *
 * new Elysia()
 *   .use(createElogs())
 *   .error(errors[0], (ctx) => problem(409, { detail: "Duplicate" }))
 *   .get("/users", () => {
 *     throw new errors[0]();
 *   });
 * ```
 *
 * @public
 */
export const errorMap = (
  map: Record<string, { status: number; title: string; type?: string }>
): Array<new (...args: unknown[]) => HTTPError> =>
  Object.entries(map).map(([slug, { status, title, type }]) => {
    const finalType = type ?? slug;
    class MappedHTTPError extends HTTPError {
      override readonly status: number = status;
      override readonly type: string = finalType;
      readonly problemTitle: string = title;
    }
    return MappedHTTPError as unknown as new (
      ...args: unknown[]
    ) => HTTPError;
  });

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
 * // → 响应 404 + application/problem+json + createElogs 写一条 WARNING 日志
 * ```
 *
 * @public
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
