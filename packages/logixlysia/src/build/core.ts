/**
 * logixlysia 2.0 — 核心状态聚合
 *
 * 把"创建一次、传给多个 builder"的状态打包成一个对象,
 * 避免 `logixlysia` 主函数里堆 6 个局部变量。
 *
 * 之前散在主函数 Step 1-4 里的东西:
 * - resolveOptions (preset 合并 + logRotation 校验)
 * - WeakMap<Request, bigint>  requestStartTimes
 * - WeakSet<Request>          didCustomLog
 * - RequestContextStore       contextStore
 * - Logger                    logger
 * - ResolvedRequestIdConfig   requestIdConfig
 * - boolean                   useALS
 */

import { resolveOptions } from "../config/resolve-options";
import {
  createRequestContextStore,
  type RequestContextStore,
} from "../context/request-context";
import {
  resolveRequestIdConfig,
  type ResolvedRequestIdConfig,
} from "../middleware/request-id";
import { createLogger } from "../logger";
import type { Logger, LogixlysiaOptions } from "../interfaces";

export interface LogixlysiaCore {
  resolvedOptions: LogixlysiaOptions;
  logger: Logger;
  contextStore: RequestContextStore;
  requestStartTimes: WeakMap<Request, bigint>;
  didCustomLog: WeakSet<Request>;
  requestIdConfig: ResolvedRequestIdConfig | null;
  useALS: boolean;
}

export const createCore = (options: LogixlysiaOptions = {}): LogixlysiaCore => {
  const resolvedOptions = resolveOptions(options);

  const requestStartTimes = new WeakMap<Request, bigint>();
  const didCustomLog = new WeakSet<Request>();
  const contextStore = createRequestContextStore();

  // 包装 logger 的 4 个便利方法,自动标记"已自定义记录"以便 afterHandle 跳过
  const baseLogger = createLogger(resolvedOptions, undefined, contextStore);
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

  const requestIdConfig = resolveRequestIdConfig(
    resolvedOptions.config?.requestId ?? false
  );
  const useALS = resolvedOptions.config?.useAsyncLocalStorage === true;

  return {
    resolvedOptions,
    logger,
    contextStore,
    requestStartTimes,
    didCustomLog,
    requestIdConfig,
    useALS,
  };
};
