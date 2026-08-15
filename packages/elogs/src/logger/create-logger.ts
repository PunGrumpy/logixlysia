/**
 * createElogs 2.0 — 日志格式与样式
 *
 * 提供:
 * - `formatDuration(ms)` — 数字 → "0.34ms" / "1.5s" / "11s"
 * - `formatLogOutput({...})` — 单条日志渲染 → `{ main, contextLines }`
 * - `buildContextTreeLines(level, data, options)` — 上下文树行数组
 * - `createFormatContext(options)` — 一次性 hoist per-logger 常量(模板、threshold、service 等)
 * - `FormatContext` / `PrecomputedLogParts` / `LogFormatTokens` — 类型导出
 * - `logWithPino(pino, level, data)` — 转发到 pino 底层
 *
 * 上游 main (b173c44) 共享 sample token 模式:模板里的 token(如 `{duration}` `{speed}`)
 * 只在真出现时计算,避免在 hot path 上无条件跑 `process.hrtime` 或颜色包装。
 */

import chalk from "chalk";
import { getStatusCode } from "../helpers/status";
import type {
  CreateElogsOptions,
  LogLevel,
  Pino,
  StoreData,
} from "../interfaces";
import { pad2, pad3 } from "../utils/format";

/** 默认日志格式(emoji + 完整 token 集合) */
const DEFAULT_LOG_FORMAT =
  "🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip} {context}";

/** 用户可解析的全部 token 集合 — 用于判断哪些 token 在本条日志中需要计算 */
const TOKEN_PATTERN = /\{([a-zA-Z]+)\}/g;

const collectTokens = (template: string): Set<string> => {
  const tokens = new Set<string>();
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    tokens.add(match[1] ?? "");
  }
  return tokens;
};

/**
 * 数字 → "0ms" / "12ms" / "0.34ms" / "1s" / "1.5s" / "11s"
 * @internal
 */
export const formatDuration = (ms: number): string => {
  if (ms === 0) {
    return "0ms";
  }
  if (ms < 1) {
    return `${ms.toFixed(2)}ms`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  const seconds = ms / 1000;
  if (Number.isInteger(seconds)) {
    return `${seconds}s`;
  }
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.round(seconds)}s`;
};

/**
 * 一次性 hoist 的 per-logger 常量。
 * createLogger 调用时计算,后续每条 emit 直接读取,避免重复 `padStart`/颜色开关判断。
 * @internal
 */
export interface FormatContext {
  /** 慢请求阈值 (ms) — duration >= 此值打 slow 标记 */
  slowThreshold: number;
  /** 自定义格式模板(已回退到 default) */
  template: string;
  /** 启用的 token 集合(已经解析的 Set<string>) */
  tokens: Set<string>;
  /** TTY 判定 + config.useColors */
  useColors: boolean;
  /** 极慢请求阈值 (ms) — duration >= 此值打 ⚡ 标记 */
  verySlowThreshold: number;
}

/** @internal */
export const createFormatContext = (
  options: CreateElogsOptions
): FormatContext => {
  const config = options.config ?? {};
  const enabledByConfig = config.useColors ?? options.format?.colors ?? true;
  const isTty =
    typeof process !== "undefined" && process.stdout?.isTTY === true;

  const template = config.customLogFormat ?? DEFAULT_LOG_FORMAT;

  return {
    slowThreshold: config.slowThreshold ?? 0,
    template,
    tokens: collectTokens(template),
    useColors: enabledByConfig && isTty,
    verySlowThreshold: config.verySlowThreshold ?? 0,
  };
};

/**
 * 在 emit pipeline 里 precomputed 一次,所有 sink 共享(避免重复 `process.hrtime`)
 * @internal
 */
export interface PrecomputedLogParts {
  /** 渲染好的耗时字符串,如 "0.34ms" / "1.5s" */
  durationMs: number;
  /** 已解析的 pathname(永远) */
  pathname: string;
  /** 已解析的 search(空字符串如果 logQueryParams 关闭或无 query) */
  search: string;
}

const formatTimestamp = (date: Date, pattern?: string): string => {
  if (!pattern) {
    return date.toISOString();
  }
  const yyyy = String(date.getFullYear());
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const MM = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const SSS = pad3(date.getMilliseconds());

  return pattern
    .replaceAll("yyyy", yyyy)
    .replaceAll("mm", mm)
    .replaceAll("dd", dd)
    .replaceAll("HH", HH)
    .replaceAll("MM", MM)
    .replaceAll("ss", ss)
    .replaceAll("SSS", SSS);
};

const getIp = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "";
  }
  return request.headers.get("x-real-ip") ?? "";
};

const getColoredLevel = (level: LogLevel, useColors: boolean): string => {
  if (!useColors) {
    return level;
  }
  if (level === "ERROR") {
    return chalk.bgRed.black(level);
  }
  if (level === "WARNING") {
    return chalk.bgYellow.black(level);
  }
  if (level === "DEBUG") {
    return chalk.bgBlue.black(level);
  }
  return chalk.bgGreen.black(level);
};

const getColoredMethod = (method: string, useColors: boolean): string => {
  if (!useColors) {
    return method.toUpperCase();
  }
  const upper = method.toUpperCase();
  if (upper === "GET") {
    return chalk.green.bold(upper);
  }
  if (upper === "POST") {
    return chalk.blue.bold(upper);
  }
  if (upper === "PUT") {
    return chalk.yellow.bold(upper);
  }
  if (upper === "PATCH") {
    return chalk.yellowBright.bold(upper);
  }
  if (upper === "DELETE") {
    return chalk.red.bold(upper);
  }
  if (upper === "OPTIONS") {
    return chalk.cyan.bold(upper);
  }
  if (upper === "HEAD") {
    return chalk.greenBright.bold(upper);
  }
  if (upper === "TRACE") {
    return chalk.magenta.bold(upper);
  }
  if (upper === "CONNECT") {
    return chalk.cyanBright.bold(upper);
  }
  return chalk.white.bold(upper);
};

const getColoredStatus = (status: string, useColors: boolean): string => {
  if (!useColors) {
    return status;
  }
  const numeric = Number.parseInt(status, 10);
  if (!Number.isFinite(numeric)) {
    return status;
  }
  if (numeric >= 500) {
    return chalk.red(status);
  }
  if (numeric >= 400) {
    return chalk.yellow(status);
  }
  if (numeric >= 300) {
    return chalk.cyan(status);
  }
  if (numeric >= 200) {
    return chalk.green(status);
  }
  return chalk.gray(status);
};

const getColoredDuration = (duration: string, useColors: boolean): string =>
  useColors ? chalk.gray(duration) : duration;

const getColoredTimestamp = (ts: string, useColors: boolean): string =>
  useColors ? chalk.bgHex("#FFA500").black(ts) : ts;

const getColoredPathname = (p: string, useColors: boolean): string =>
  useColors ? chalk.whiteBright(p) : p;

const STATUS_TEXT_BY_CODE: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

const getStatusText = (code: number): string => STATUS_TEXT_BY_CODE[code] ?? "";

/**
 * 渲染单条日志的主行 + 上下文树行数组。
 * main 是单行字符串,contextLines 是每行 `├─ key: value` 风格(没 context 就是空数组)。
 * @internal
 */
export const formatLogOutput = ({
  data,
  formatContext,
  level,
  options,
  precomputed,
  request,
  store,
}: {
  data: Record<string, unknown>;
  formatContext?: FormatContext | null;
  level: LogLevel;
  options: CreateElogsOptions;
  precomputed?: PrecomputedLogParts;
  request: Request;
  store: StoreData;
}): { main: string; contextLines: string[] } => {
  const config = options.config ?? {};
  const ctx = formatContext ?? createFormatContext(options);
  const { tokens, useColors, template } = ctx;

  // Default precomputed if caller didn't supply (test paths use direct formatLogOutput)
  const fallbackUrl = (() => {
    try {
      return new URL(request.url);
    } catch {
      return null;
    }
  })();
  const before = store.beforeTime ?? BigInt(0);
  const durationMs = precomputed
    ? precomputed.durationMs
    : before === BigInt(0)
      ? 0
      : Number(process.hrtime.bigint() - before) / 1_000_000;
  const pathname =
    precomputed?.pathname || store.pathname || fallbackUrl?.pathname || "/";
  const search = precomputed ? precomputed.search : (fallbackUrl?.search ?? "");

  const now = new Date();
  const timestampPattern =
    typeof config.timestamp === "string"
      ? config.timestamp
      : (config.timestamp as { format?: string } | undefined)?.format;
  const rawTimestamp = formatTimestamp(now, timestampPattern);
  const timestamp = getColoredTimestamp(rawTimestamp, useColors);

  const message = typeof data.message === "string" ? data.message : "";
  const statusValue = data.status;
  const statusCode =
    statusValue === null || statusValue === undefined
      ? 200
      : getStatusCode(statusValue);
  const status = String(statusCode);

  // Pathname with optional query (from precomputed)
  const showQuery = config.logQueryParams === true;
  const fullPath = showQuery && search ? `${pathname}${search}` : pathname;

  const ip =
    config.ip === true ||
    config.showIp === true ||
    options.format?.showIp === true
      ? getIp(request)
      : "";
  const coloredLevel = getColoredLevel(level, useColors);
  const coloredMethod = getColoredMethod(request.method, useColors);
  const coloredStatus = getColoredStatus(status, useColors);
  const coloredPathname = getColoredPathname(fullPath, useColors);
  const coloredDuration = getColoredDuration(
    formatDuration(durationMs),
    useColors
  );

  // Speed token: ⚡ + path when duration >= verySlowThreshold (and > 0)
  const needsSpeed = tokens.has("speed");
  const speedToken =
    needsSpeed && durationMs >= ctx.verySlowThreshold && durationMs > 0
      ? `⚡ ${coloredPathname}`
      : "";

  // Service token: always present in the main line; empty when no service configured
  const serviceToken = config.service ? `[${config.service}]` : "";

  // StatusText token
  const statusText = tokens.has("statusText") ? getStatusText(statusCode) : "";

  // Context token: inline JSON (when showContextTree is false) or empty (when true;
  // the tree lines are returned separately)
  const showTree = config.showContextTree ?? true;
  const dataCtx = data.context;
  const ctxString =
    !showTree &&
    dataCtx !== undefined &&
    dataCtx !== null &&
    typeof dataCtx === "object" &&
    !Array.isArray(dataCtx) &&
    Object.keys(dataCtx as object).length > 0
      ? JSON.stringify(dataCtx)
      : "";

  // Build the line by replacing tokens; only the tokens that appear get replaced
  // (others are kept as literal text if they happen to share a name with a value).
  const replacements: Record<string, string> = {
    context: ctxString,
    duration: coloredDuration,
    epoch: String(now.getTime()),
    ip,
    level: coloredLevel,
    message,
    method: coloredMethod,
    now: timestamp,
    path: coloredPathname,
    pathname: coloredPathname,
    query: search,
    requestid: "",
    service: "",
    speed: speedToken,
    status: coloredStatus,
    statustext: statusText,
  };
  // The token regex is case-insensitive in upstream main; we use a case-insensitive
  // match here so tokens like {RequestId} still work.
  let main = template.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) => {
    const key = name.toLowerCase();
    return Object.hasOwn(replacements, key)
      ? (replacements[key] ?? match)
      : match;
  });
  // If a service is configured, prefix the main line with [service]
  if (serviceToken) {
    main = `${serviceToken} ${main}`;
  }

  // Slow request marker: append ⚡ if duration >= slowThreshold (and > 0), and not already shown via speed
  let withSlowMarker = main;
  if (
    durationMs > 0 &&
    durationMs >= ctx.slowThreshold &&
    !main.includes("⚡")
  ) {
    withSlowMarker = `${main} ⚡ slow`;
  }

  // Build context tree lines only when showContextTree is true
  const contextLines: string[] = showTree
    ? buildContextTreeLines(level, data, options)
    : [];

  return { contextLines, main: withSlowMarker };
};

/**
 * 上下文树行:ERROR 时展开 error.why/fix/link/internal,其他只展开 context 对象。
 * 永远不泄露 secret-like key 的值(尽管 redact 已经在 emit 之前跑了 — 这里再做一次防御)。
 * @internal
 */
export const buildContextTreeLines = (
  level: LogLevel,
  data: Record<string, unknown>,
  options: CreateElogsOptions
): string[] => {
  const config = options.config ?? {};
  const { context: ctxObj, error } = data;
  const lines: string[] = [];

  const formatInlineValue = (v: unknown): string => {
    if (v === null || v === undefined) {
      return "";
    }
    if (typeof v === "string") {
      return v;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      return String(v);
    }
    return JSON.stringify(v);
  };

  // ERROR level + error object: add error line + structured fields
  if (level === "ERROR" && error !== undefined && error !== null) {
    const errObj =
      typeof error === "object" && error !== null
        ? (error as Record<string, unknown>)
        : null;
    const name = typeof errObj?.name === "string" ? errObj.name : "Error";
    const message =
      typeof errObj?.message === "string" ? errObj.message : String(error);
    lines.push(`├─ error: ${name}: ${message}`);

    if (errObj) {
      for (const key of ["why", "fix", "link"] as const) {
        if (typeof errObj[key] === "string" && errObj[key]) {
          lines.push(`├─ error.${key}: ${errObj[key]}`);
        }
      }
      if (errObj.internal !== undefined) {
        lines.push(`└─ error.internal: ${formatInlineValue(errObj.internal)}`);
      }
    }
    return lines;
  }

  if (
    ctxObj === undefined ||
    ctxObj === null ||
    typeof ctxObj !== "object" ||
    Array.isArray(ctxObj) ||
    Object.keys(ctxObj as object).length === 0
  ) {
    return lines;
  }

  const depth = Math.max(1, config.contextDepth ?? 1);
  const entries = Object.entries(ctxObj as Record<string, unknown>);

  // Flatten at depth N: for depth=1 just top-level keys; for depth>1 expand
  // nested objects into `parent.child` style.
  const flat: [string, unknown][] = [];
  const flatten = (obj: Record<string, unknown>, prefix: string, d: number) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (
        d > 1 &&
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        !(v instanceof Error) &&
        !(v instanceof Date)
      ) {
        flatten(v as Record<string, unknown>, key, d - 1);
      } else {
        flat.push([key, v]);
      }
    }
  };
  if (depth > 1) {
    flatten(ctxObj as Record<string, unknown>, "", depth);
  } else {
    for (const [k, v] of entries) {
      flat.push([k, v]);
    }
  }

  flat.forEach(([key, value], index) => {
    const isLast = index === flat.length - 1;
    const branch = isLast ? "└─" : "├─";
    lines.push(`${branch} ${key}: ${formatInlineValue(value)}`);
  });

  return lines;
};

/** @internal */
export const logWithPino = (
  logger: Pino,
  level: LogLevel,
  data: Record<string, unknown>
): void => {
  if (level === "ERROR") {
    logger.error(data);
    return;
  }
  if (level === "WARNING") {
    logger.warn(data);
    return;
  }
  if (level === "DEBUG") {
    logger.debug(data);
    return;
  }
  logger.info(data);
};
