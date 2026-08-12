/**
 * logixlysia 2.0 — Elysia 2.0 错误系统的桥梁
 *
 * 提供一个函数式工厂 `httpError()`,让用户像 1.x 那样一行抛出 HTTPError,
 * 而不必每次写 `class extends HTTPError.id(...)`。
 *
 * 完全基于 Elysia 2.0 原生的 `HTTPError` —— 没有任何自建错误类。
 */

import { HTTPError, type StatusMap } from "elysia";
import { getStatusCode } from "./helpers/status";

const normalizeStatus = (status: number | keyof StatusMap): number => {
  if (typeof status === "number") return status;
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
