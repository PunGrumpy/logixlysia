import { Elysia, type SingletonBase } from "elysia";
import { startServer } from "./extensions";
import type { LogixlysiaStore, Options } from "./interfaces";
import { createLogger } from "./logger";
import { normalizeToProblem } from "./utils/handle-error";

export type Logixlysia = Elysia<
  "Logixlysia",
  SingletonBase & { store: LogixlysiaStore }
>;

export const logixlysia = (options: Options = {}): Logixlysia => {
  const didCustomLog = new WeakSet<Request>();
  const baseLogger = createLogger(options);
  const logger = {
    ...baseLogger,
    debug: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request);
      baseLogger.debug(request, message, context);
    },
    info: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request);
      baseLogger.info(request, message, context);
    },
    warn: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request);
      baseLogger.warn(request, message, context);
    },
    error: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request);
      baseLogger.error(request, message, context);
    },
  };

  const app = new Elysia({
    name: "Logixlysia",
  });

  const errorConfig = options.error;

  return (
    app
      .state("logger", logger)
      .state("pino", logger.pino)
      .state("beforeTime", BigInt(0))
      .state("pathname", "")
      .setup(({ server }) => {
        if (server) {
          startServer(server, options);
        }
      })
      .request(({ request, store }) => {
        store.beforeTime = process.hrtime.bigint();
        store.pathname = new URL(request.url).pathname;
      })
      .afterHandle(({ request, set, store }) => {
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

        logger.log(level, request, { status }, store);
      })
      .error(({ request, error, code, path, store, set }) => {
        // ① 分层解析为 ProblemError
        const problem = normalizeToProblem(error, code, path, {
          typeBaseUrl: errorConfig?.typeBaseUrl,
          errorMap: errorConfig?.errorMap,
          resolve: errorConfig?.resolve,
          request,
        });

        // ② 打印日志
        logger.handleHttpError(request, problem, store, options);

        // ③ 返回 RFC 9457 响应
        set.status = problem.status;
        set.headers["content-type"] = "application/problem+json";
        return problem.toJSON();
      })
      // Ensure plugin lifecycle hooks apply to the parent app.
      .as("scoped") as unknown as Logixlysia
  );
};

// ==========================================
// Error Exports
// ==========================================

export type {
  HttpErrorConstructor,
  ProblemConfig,
  ProblemDocument,
} from "./error/errors";
export * from "./error/errors";
export { createProblem } from "./error/errors";
export type { Code } from "./error/type";

// ==========================================
// Utils Exports
// ==========================================

export type { ErrorMeta } from "./utils/get-error-code";
export { getErrorCode, getErrorMeta } from "./utils/get-error-code";
export { normalizeToProblem } from "./utils/handle-error";

// ==========================================
// Interface Exports
// ==========================================

export type {
  ErrorConfig,
  ErrorMapping,
  ErrorResolver,
  FileConfig,
  FormatConfig,
  Logger,
  LogixlysiaContext,
  LogixlysiaStore,
  LogLevel,
  Options,
  Pino,
  StartupConfig,
  StoreData,
  Transport,
  TransportsConfig,
} from "./interfaces";

export default logixlysia;
