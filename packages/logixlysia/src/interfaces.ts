/**
 * createLogPlugin 2.0 — 公共类型
 *
 * 适配 Elysia 2.0(2.0.0-exp.62) + 上游 main (b173c44) 吸收:
 * - 单 emit 管道 (filter→context merge→redact→transports→file→console)
 * - FileSink 句柄缓存 + 批写
 * - lazy pino via Proxy
 * - requestStartTimes WeakMap(per-request 时序)
 * - AsyncLocalStorage request-scoped logger
 * - request-id 中间件
 * - RFC 9457 错误桥接
 */

import type {
  Logger as PinoLogger,
  LoggerOptions as PinoLoggerOptions,
} from "pino";

/** Pino Logger 实例类型 */
export type Pino = PinoLogger<never, boolean>;

/**
 * Minimal HTTP-aware Error used by createLogPlugin for non-Elysia call sites
 * (re-export pipeline, redact tests, integration helpers). Independent of
 * Elysia 2's `HTTPError` (note the capitalisation) — that one lives in
 * `elysia` and is the type the framework actually responds with.
 */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** 日志级别 */
export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";

/** 单次请求携带的计时和路径数据 */
export interface StoreData {
  /** 请求开始的纳秒时间戳（hrtime） */
  beforeTime?: bigint;
  /** 缓存的 URL pathname，避免重复解析 */
  pathname?: string;
}

/** Elysia store 中挂载的 createLogPlugin 状态 */
export interface LogixlysiaStore {
  beforeTime?: bigint;
  logger: Logger;
  pathname?: string;
  pino: Pino;
  [key: string]: unknown;
}

/** 自定义日志传输接口（如 Elasticsearch、Slack 等） */
export interface Transport {
  /**
   * 接收一条日志并输出到外部系统
   *
   * @param level - 日志级别
   * @param message - 日志消息
   * @param meta - 附加元数据（请求信息、耗时等）
   */
  log: (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ) => void | Promise<void>;
}

/** 日志文件轮转配置 */
export interface LogRotationConfig {
  /** 轮转后是否压缩旧文件 */
  compress?: boolean;
  /** 压缩算法 */
  compression?: "gzip";
  /** 固定间隔轮转，如 `'1d'`、`'12h'` */
  interval?: string;
  /** 保留的最大文件数量或时长，如 `10` 或 `'7d'` */
  maxFiles?: number | string;
  /** 单个日志文件最大体积，如 `'10m'`、`'5k'`，或字节数 */
  maxSize?: string | number;
}

/** request-id 中间件配置 */
export interface RequestIdConfig {
  /** 显式启用/禁用(默认 true) */
  enabled?: boolean;
  /** 自定义生成器(默认 UUID v4) */
  generator?: () => string;
  /** HTTP header 名,默认 `'X-Request-Id'` */
  header?: string;
}

/** 日志级别过滤 */
export interface LogFilter {
  /** 只输出这些级别;空数组表示不过滤 */
  level?: LogLevel[];
}

/** Pino 配置(createLogPlugin 透传) */
export interface PinoConfig {
  /** 显式禁用 pino(测试中常用) */
  enabled?: boolean;
  /** Pretty 打印(pino-pretty) */
  prettyPrint?: boolean;
  /** 其他 pino options 透传 */
  [key: string]: unknown;
}

/** 启动消息配置 */
export interface StartupConfig {
  /** 启动消息格式，默认 `"banner"` */
  format?: "simple" | "banner";
  /** 是否显示启动消息，默认 `true` */
  show?: boolean;
}

/** 日志格式配置(legacy root-level;新代码用 `config.*`) */
export interface FormatConfig {
  /** 是否启用彩色输出，默认 `true`（仅 TTY） */
  colors?: boolean;
  /** 是否在日志中显示请求 IP，默认 `false` */
  showIp?: boolean;
  /** 自定义日志模板 */
  template?: string;
  /** 时间戳格式，如 `'yyyy-mm-dd HH:MM:ss.SSS'` */
  timestamp?: string;
}

/** 文件日志配置(legacy root-level) */
export interface FileConfig {
  /** 日志文件路径（必填） */
  path: string;
  /** 日志轮转配置 */
  rotation?: LogRotationConfig;
}

/** 自定义传输配置(legacy root-level) */
export interface TransportsConfig {
  /** 设为 `true` 时只使用 transports，禁用控制台和文件输出 */
  only?: boolean;
  /** 传输目标列表 */
  targets: Transport[];
}

/** 错误处理配置（createLogPlugin 2.0 极简版） */
export interface ErrorConfig {
  /** 是否在控制台显示完整错误详情，默认 `false` */
  verbose?: boolean;
}

/**
 * 错误翻译器接口 —— 把任意错误转换为更合适的 Error 实例
 *
 * 用法见 `translator/drizzle.ts`(`translateDrizzleError`)
 * 和 `plugin.ts` 的 `autoTranslate.custom` 配置。
 */
export type ErrorTranslator = {
  /** 判断是否能处理该 error */
  canHandle: (error: unknown) => boolean;
  /** 翻译为新的 Error(通常是 HTTPError / 自定义 Error 子类) */
  translate: (error: unknown) => Error;
};

/**
 * 自动翻译配置 —— 在单点 onError 钩子里跑一组 translator,
 * 翻译后的 error 决定日志级别和记录内容,但**不**改变错误传播。
 *
 * **关键不变量**:翻译只影响日志输出,不劫持错误处理流程。错误继续
 * 以原 error 形态传播,用户的 `.error(MyClass, fn)` / Elysia 默认
 * `application/problem+json` 响应都不受影响。
 */
export interface AutoTranslateConfig {
  /** 用户自定义 translator(在内置之后执行,优先匹配) */
  custom?: ErrorTranslator[];
  /** 启用的 DB 类型,选择内置 translator 集合 */
  db: "drizzle";
}

/**
 * 新版(上游 main)配置 — 所有 createLogPlugin 行为参数集中在 `config` 字段下。
 * 同时保留 root-level 字段(legacy + 旧测试)以便向后兼容。
 */
export interface LogixlysiaConfig {
  /** 自动 redact 敏感信息(headers, body, query string) */
  autoRedact?: boolean;
  /** 上下文树展开深度(默认 1) */
  contextDepth?: number;
  /** 自定义日志格式模板,支持 token:`{now}` `{level}` `{duration}` `{method}` `{pathname}` `{status}` `{message}` `{ip}` `{context}` `{query}` `{statusText}` `{requestId}` `{service}` `{speed}` 等 */
  customLogFormat?: string;
  /** 禁用文件日志(即使有 logFilePath) */
  disableFileLogging?: boolean;
  /** 禁用内置控制台 logger */
  disableInternalLogger?: boolean;
  /** 禁用 WebSocket 日志 */
  disableWebSocketLogging?: boolean;
  /** 在日志中显示 IP(x-forwarded-for / x-real-ip) */
  ip?: boolean;
  /** 目录模式(默认 0o700) */
  logDirMode?: number;
  /** 把错误对象的 payload(可能是用户输入)写入 meta,默认 false(防泄露) */
  logErrorPayload?: boolean;
  /** 文件模式(默认 0o600) */
  logFileMode?: number;
  /** 日志文件路径 */
  logFilePath?: string;
  /** 日志级别过滤 */
  logFilter?: LogFilter;
  /** 在 pathname 中包含 query string */
  logQueryParams?: boolean;
  /** 日志轮转 */
  logRotation?: LogRotationConfig;
  /** Pino 配置 */
  pino?: PinoConfig;
  /** 自定义 redact key 列表(合并到默认敏感 key) */
  redactKeys?: string[];
  /** request-id 跟踪 */
  requestId?: boolean | RequestIdConfig;
  /** 服务名(显示在日志中) */
  service?: string;
  /** 显示上下文树(默认 true) */
  showContextTree?: boolean;
  /** 显示 IP(等价于 ip) */
  showIp?: boolean;
  /** 是否显示启动消息 */
  showStartupMessage?: boolean;
  /** 慢请求阈值(ms),超过显示慢请求标记 */
  slowThreshold?: number;
  /** 启动消息格式 */
  startupMessageFormat?: "simple" | "banner";
  /** 时间戳格式或 { format } */
  timestamp?: string | { format: string };
  /** 透传 transport 列表(emit 用;`transports` 也可以在 root,但 emit 只看 config) */
  transports?: Transport[];
  /** Transport 错误节流窗口(ms) */
  transportThrottleMs?: number;
  /**
   * 启用 AsyncLocalStorage,让 `useLogger()` 在深调用栈拿得到 logger。
   *
   * **实现细节**:在 Elysia 2 的 `.request()` 钩子内用 `loggerStorage.enterWith(...)`
   * 设置 scope。这会**透传**到后续的路由 handler / `.afterHandle()`(只要 Elysia
   * 自己在它们之间不再额外 `als.run()`)。
   *
   * **限制**:
   * - Elysia 2 升级后如果在内部多次 `als.run()`,此机制会失效,`useLogger()` 退回
   *   NOOP_LOGGER,日志被吞。
   * - `enterWith` 不影响"已在运行的 async 树",只影响"从此处之后"新发起的 async。
   *
   * **推荐**:深调用栈场景优先用 `({ log })` derive(Elysia 自己的 context 机制,
   * 不依赖 ALS);`useLogger()` 仅在"想拿 logger 但不想改签名"的便利场景使用。
   */
  useAsyncLocalStorage?: boolean;
  /** 启用彩色输出(默认 true 仅 TTY) */
  useColors?: boolean;
  /** 只使用 transports,禁用控制台 + 文件 */
  useTransportsOnly?: boolean;
  /** 极慢请求阈值(ms),超过显示更严重标记 */
  verySlowThreshold?: number;
}

/**
 * Logixlysia 插件配置
 *
 * 新版推荐:`{ config: {...}, preset?: 'dev' | 'prod' | 'json' }`
 * 同时兼容 root-level 字段(legacy tests)
 */
export interface CreateLogPluginOptions {
  /** 自动翻译错误:在单点 onError 钩子里跑 translator 链 */
  autoTranslate?: AutoTranslateConfig;
  /** 新版配置块 */
  config?: LogixlysiaConfig;
  /** 错误处理配置 */
  error?: ErrorConfig;
  /** 文件日志配置(legacy) */
  file?: false | FileConfig;
  /** 日志格式配置(legacy) */
  format?: FormatConfig;
  /** 日志级别过滤 (root-level 别名,等价于 `config.logFilter.level`) */
  logLevel?: LogLevel[];
  /** Pino Logger 原生配置透传(legacy) */
  pino?: PinoLoggerOptions;
  /**
   * 预设,应用一组默认 config 值。
   * 内置:`"dev"` / `"prod"` / `"json"`(IDE 自动补全)。
   * 任意字符串都行 —— 通过 `registerPreset(name, defaults)` 加自己的。
   */
  preset?: "dev" | "prod" | "json" | (string & {});
  /** 启动消息配置(legacy) */
  startup?: StartupConfig;
  /** 自定义传输(legacy) */
  transports?: Transport[] | TransportsConfig;
}

// ==========================================
// Logger
// ==========================================

/**
 * Logger 实例,可通过 `store.logger` 访问
 *
 * 9 个方法:
 * - debug / info / warn / error: 便利级别快捷方法
 * - log: 显式 level + data 入口
 * - handleHttpError: 错误处理入口
 * - getContext / mergeContext: per-request 累积 context
 * - pino: 底层 Pino Logger
 */
export interface Logger {
  /** 记录 DEBUG 级别日志 */
  debug: (
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ) => void;
  /** 记录 ERROR 级别日志 */
  error: (
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ) => void;
  /** 获取累积的 per-request context */
  getContext: (request: Request) => Readonly<Record<string, unknown>>;
  /**
   * 处理 HTTP 错误并输出日志
   */
  handleHttpError: (
    request: Request,
    error: unknown,
    store: StoreData,
    options?: CreateLogPluginOptions
  ) => void;
  /** 记录 INFO 级别日志 */
  info: (
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ) => void;
  /** 记录指定级别的日志 */
  log: (
    level: LogLevel,
    request: Request,
    data: Record<string, unknown>,
    store: StoreData
  ) => void;
  /** 合并 per-request context(后续 access log 带上) */
  mergeContext: (request: Request, partial: Record<string, unknown>) => void;
  /** 底层 Pino Logger 实例 */
  pino: Pino;
  /** 记录 WARNING 级别日志 */
  warn: (
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ) => void;
}

/**
 * Request-scoped Logger,挂在 `context.log` 上,不需要传 request 参数。
 * 由 AsyncLocalStorage `useLogger()` 也能拿到(深调用栈场景)。
 */
export interface RequestScopedLogger {
  /** 记录 DEBUG 级别日志 */
  debug: (message: string, context?: Record<string, unknown>) => void;
  /** 记录 ERROR 级别日志 */
  error: (message: string, context?: Record<string, unknown>) => void;
  /** 记录 INFO 级别日志 */
  info: (message: string, context?: Record<string, unknown>) => void;
  /** 合并 context(无 request 参数,因为已绑定) */
  mergeContext: (partial: Record<string, unknown>) => void;
  /** 记录 WARNING 级别日志 */
  warn: (message: string, context?: Record<string, unknown>) => void;
}

/** Logixlysia 请求上下文 */
export interface LogixlysiaContext {
  request: Request;
  store: LogixlysiaStore;
}
