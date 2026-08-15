/**
 * createElogs 2.0 — HTTP 错误日志处理
 *
 * 接受任意 `unknown` 错误(不再依赖自建 ProblemError),通过
 * `utils/error.ts:normalizeLoggedError` 提取安全结构化字段,再走单 emit 管道
 * (filter→context merge→redact→transports→file→console)输出。
 *
 * 4xx 走 `WARNING`,5xx 走 `ERROR` —— `consoleForLevel` 会把 `WARNING` 路由到 `console.warn`、
 * `ERROR` 到 `console.error`,无需在这里直接调 console。
 */

import type { RequestContextStore } from "../context/request-context";
import { extractStatus, levelForStatus } from "../errors";

import type { CreateElogsOptions, LogLevel, StoreData } from "../interfaces";
import { isStructuredError, normalizeLoggedError } from "../utils/error";
import { createFormatContext } from "./create-logger";
import { computePrecomputedLogParts, emit, resolveSinks } from "./emit";

/**
 * 旧版 entry — 直接调用,不依赖 RequestContextStore(用于 createLogger 的 fallback 路径)。
 * @internal
 */
export const handleHttpError = (
  request: Request,
  error: unknown,
  store: StoreData,
  options: CreateElogsOptions
): void => {
  const status = extractStatus(error) ?? 500;
  const level: LogLevel = levelForStatus(status);
  const logErrorPayload = options.config?.logErrorPayload === true;
  const normalized = normalizeLoggedError(error, logErrorPayload);

  const data: Record<string, unknown> = {
    error: normalized.error,
    message: normalized.message,
    status,
  };
  // Structured error (why/fix/link/internal) at top level for downstream readers
  if (isStructuredError(error)) {
    for (const key of ["why", "fix", "link", "internal"] as const) {
      if (error[key] !== undefined) {
        data[key] = error[key];
      }
    }
  }

  const formatContext = createFormatContext(options);
  const sinks = resolveSinks(options);
  const precomputed = computePrecomputedLogParts(
    store,
    request,
    sinks.needsUrlParts
  );
  const noopStore: RequestContextStore = {
    clearContext: () => undefined,
    getContext: () => ({}),
    mergeContext: () => undefined,
    peekContext: () => ({}),
  };
  emit({
    contextStore: noopStore,
    data,
    formatContext,
    level,
    options,
    precomputed,
    request,
    sinks,
    store,
  });
};
