/**
 * logixlysia 2.0 — HTTP 错误日志处理
 *
 * 接受任意 `unknown` 错误(不再依赖自建 ProblemError),
 * 内部从 error.status / error.message / error.type / HTTPError.toResponse() 推断字段。
 */

import type {
  LogixlysiaOptions,
  LogLevel,
  StoreData,
  Transport,
  TransportsConfig,
} from "../interfaces";
import { logToTransports } from "../output";
import { logToFile } from "../output/file";

const normalizeTransports = (
  transports?: Transport[] | TransportsConfig
): { targets: Transport[]; only: boolean } => {
  if (!transports) return { targets: [], only: false };
  if (Array.isArray(transports)) return { targets: transports, only: false };
  return { targets: transports.targets, only: transports.only === true };
};

const extractStatus = (error: unknown): number => {
  if (typeof error !== "object" || error === null) return 500;
  const e = error as { status?: unknown };
  if (typeof e.status === "number") return e.status;
  return 500;
};

const extractErrorBody = (
  error: unknown
): { type?: string; title?: string; detail?: string; [k: string]: unknown } => {
  if (typeof error !== "object" || error === null) return {};
  const e = error as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof e.type === "string") out.type = e.type;
  if (typeof e.problemTitle === "string") out.title = e.problemTitle;
  if (typeof e.title === "string" && out.title === undefined)
    out.title = e.title;
  if (typeof e.detail === "string") out.detail = e.detail;
  // HTTPError.toResponse() 可用时,优先取其 body
  const toResp = (e as { toResponse?: () => Response }).toResponse;
  if (typeof toResp === "function") {
    // toResponse 是 Response 对象,无法 sync 取 body;跳过
  }
  return out;
};

/**
 * 统一输出管道:transports → file → console
 * handleHttpError 和 log 共用同一管道,不再重复判断配置
 */
const outputPipeline = (
  level: LogLevel,
  request: Request,
  data: Record<string, unknown>,
  store: StoreData,
  options: LogixlysiaOptions,
  consoleMessage?: string
): void => {
  const { targets, only: transportsOnly } = normalizeTransports(
    options.transports
  );

  // 1. Transports
  logToTransports({ level, request, data, store, transports: targets });

  // 2. File
  const fileConfig = options.file;
  const hasFile = fileConfig !== false && fileConfig !== undefined;
  if (!transportsOnly && hasFile) {
    logToFile({
      filePath: fileConfig.path,
      level,
      request,
      data,
      store,
      options,
    }).catch((e) => {
      console.error(e);
    });
  }

  // 3. Console
  if (transportsOnly) return;

  if (consoleMessage) {
    switch (level) {
      case "DEBUG":
        console.debug(consoleMessage);
        break;
      case "INFO":
        console.info(consoleMessage);
        break;
      case "WARNING":
        console.warn(consoleMessage);
        break;
      case "ERROR":
        console.error(consoleMessage);
        break;
      default:
        console.log(consoleMessage);
    }
  }
};

export const handleHttpError = (
  request: Request,
  error: unknown,
  store: StoreData,
  options: LogixlysiaOptions
): void => {
  const status = extractStatus(error);
  const level: LogLevel = status >= 500 ? "ERROR" : "WARNING";
  const body = extractErrorBody(error);
  const message =
    (body.detail as string | undefined) ??
    (typeof error === "object" && error !== null && "message" in error
      ? ((error as { message?: string }).message ?? "")
      : "");

  const data = {
    status,
    message,
    ...body,
  };

  // 构建 console 消息
  const { only: transportsOnly } = normalizeTransports(options.transports);
  let consoleMessage = "";
  if (!transportsOnly) {
    let timestamp = "";
    if (options.format?.timestamp) {
      timestamp = `[${new Date().toISOString()}] `;
    }
    const pathname = store.pathname || new URL(request.url).pathname;
    consoleMessage = `${timestamp}${level} ${request.method} ${pathname} ${status} - ${body.title ?? message}`;

    // 详细错误日志
    if (options.error?.verbose) {
      const parts = [consoleMessage];
      if (body.detail) parts.push(`  Detail: ${body.detail}`);
      if (body.instance) parts.push(`  Instance: ${body.instance}`);
      if (body.type && body.type !== "about:blank")
        parts.push(`  Type: ${body.type}`);
      const extensions = Object.entries(body).filter(
        ([key]) =>
          !["type", "title", "status", "detail", "instance"].includes(key)
      );
      if (extensions.length > 0) {
        parts.push("  Extensions:");
        for (const [key, value] of extensions) {
          parts.push(`    ${key}: ${JSON.stringify(value)}`);
        }
      }
      consoleMessage = parts.join("\n");
    }
  }

  outputPipeline(
    level,
    request,
    data,
    store,
    options,
    consoleMessage || undefined
  );
};

export { outputPipeline };
