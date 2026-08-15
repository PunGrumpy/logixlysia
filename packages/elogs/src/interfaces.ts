/**
 * createElogs 2.0 — 公共类型
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

/**
 * Pino Logger 实例类型
 * @internal
 */
export type Pino = PinoLogger<never, boolean>;

/**
 * 日志级别
 * @internal
 */
export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";

/**
 * 单次请求携带的计时和路径数据
 * @internal
 */
export interface StoreData {
  /** 请求开始的纳秒时间戳（hrtime） */
  beforeTime?: bigint;
  /** 缓存的 URL pathname，避免重复解析 */
  pathname?: string;
}

/**
 * Elysia store 中挂载的 createElogs 状态
 * @internal
 */
export interface ElogsStore {
  /** 请求开始的纳秒时间戳,emit 算 durationMs 用 */
  beforeTime?: bigint;
  /** 缓存的 URL pathname,避免重复解析 */
  pathname?: string;
  [key: string]: unknown;
}

/**
 * 自定义日志传输接口（如 Elasticsearch、Slack 等）
 * @internal
 */
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

/**
 * 日志文件轮转配置
 * @internal
 */
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

/**
 * request-id 中间件配置
 * @internal
 */
export interface RequestIdConfig {
  /** 显式启用/禁用(默认 true) */
  enabled?: boolean;
  /** 自定义生成器(默认 UUID v4) */
  generator?: () => string;
  /** HTTP header 名,默认 `'X-Request-Id'` */
  header?: string;
}

/**
 * 日志级别过滤
 * @internal
 */
export interface LogFilter {
  /** 只输出这些级别;空数组表示不过滤 */
  level?: LogLevel[];
}

/**
 * Pino 配置(createElogs 透传)
 * @internal
 */
export interface PinoConfig {
  /** 显式禁用 pino(测试中常用) */
  enabled?: boolean;
  /** Pretty 打印(pino-pretty) */
  prettyPrint?: boolean;
  /** 其他 pino options 透传 */
  [key: string]: unknown;
}

/**
 * 启动消息配置
 * @internal
 */
export interface StartupConfig {
  /** 启动消息格式，默认 `"banner"` */
  format?: "simple" | "banner";
  /** 是否显示启动消息，默认 `true` */
  show?: boolean;
}

/**
 * 日志格式配置(legacy root-level;新代码用 `config.*`)
 * @internal
 */
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

/**
 * 文件日志配置(legacy root-level)
 * @internal
 */
export interface FileConfig {
  /** 日志文件路径（必填） */
  path: string;
  /** 日志轮转配置 */
  rotation?: LogRotationConfig;
}

/**
 * 自定义传输配置(legacy root-level)
 * @internal
 */
export interface TransportsConfig {
  /** 设为 `true` 时只使用 transports，禁用控制台和文件输出 */
  only?: boolean;
  /** 传输目标列表 */
  targets: Transport[];
}

/**
 * 错误处理配置（createElogs 2.0 极简版）
 * @internal
 */
export interface ErrorConfig {
  /** 是否在控制台显示完整错误详情，默认 `false` */
  verbose?: boolean;
}

/**
 * 错误翻译器接口 —— 把任意错误转换为更合适的 Error 实例
 *
 * 用法见 `translator/drizzle.ts`(`translateDrizzleError`)
 * 和 `plugin.ts` 的 `autoTranslate.custom` 配置。
 * @internal
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
 * @internal
 */
export interface AutoTranslateConfig {
  /** 用户自定义 translator(在内置之后执行,优先匹配) */
  custom?: ErrorTranslator[];
  /** 启用的 DB 类型,选择内置 translator 集合 */
  db: "drizzle";
}

/**
 * 新版(上游 main)配置 — 所有 createElogs 行为参数集中在 `config` 字段下。
 * 同时保留 root-level 字段(legacy + 旧测试)以便向后兼容。
 * @public
 */
export interface ElogsConfig {
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
 * Elogs 插件配置
 *
 * 新版推荐:`{ config: {...}, preset?: 'dev' | 'prod' | 'json' }`
 * 同时兼容 root-level 字段(legacy tests)
 * @public
 */
export interface CreateElogsOptions {
  /** 自动翻译错误:在单点 onError 钩子里跑 translator 链 */
  autoTranslate?: AutoTranslateConfig;
  /** 新版配置块 */
  config?: ElogsConfig;
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
 * Logger 实例，可通过 `store.logger` 访问。
 *
 * 提供 9 个核心方法用于日志记录、上下文管理和错误处理。
 * 所有日志方法都接收 `Request` 对象，用于自动关联请求 ID 和链路追踪信息。
 *
 * @example
 * ```typescript
 * // 在 Elysia 插件或路由中获取 Logger
 * app.get('/user', ({ request, store }) => {
 *   const logger = store.logger;
 *   logger.info(request, 'Fetching user data', { userId: '123' });
 * });
 * ```
 * @public
 */
export interface Logger {
  /**
   * 记录 DEBUG 级别的调试日志。
   *
   * @param request - 当前请求对象（必填），用于关联请求上下文
   * @param message - 日志消息（必填），简要描述事件
   * @param context - 可选，额外的结构化上下文数据，会被合并到日志记录中
   *
   * @example
   * ```typescript
   * logger.debug(request, 'Cache lookup', { cacheKey: 'user:123', hit: true });
   * ```
   */
  debug: (
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ) => void;

  /**
   * 记录 ERROR 级别的错误日志。
   * 通常用于记录需要立即关注的异常或失败情况。
   *
   * @param request - 当前请求对象（必填），用于关联请求上下文
   * @param message - 错误消息（必填），描述发生了什么错误
   * @param context - 可选，额外的错误上下文，如错误码、堆栈信息等
   *
   * @example
   * ```typescript
   * try {
   *   await riskyOperation();
   * } catch (err) {
   *   logger.error(request, 'Database query failed', {
   *     query: 'SELECT * FROM users',
   *     error: err.message,
   *     stack: err.stack
   *   });
   * }
   * ```
   */
  error: (
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ) => void;

  /**
   * 获取当前请求累积的 per-request 上下文数据。
   *
   * 上下文数据通过 `mergeContext` 方法累积，会在 access log 中输出。
   * 返回的对象是只读的，不应直接修改。
   *
   * @param request - 当前请求对象（必填）
   * @returns 当前请求累积的上下文对象的只读快照
   *
   * @example
   * ```typescript
   * const ctx = logger.getContext(request);
   * console.log('Current request context:', ctx);
   * // 输出: { userId: '123', apiVersion: 'v2', processingTime: 45 }
   * ```
   */
  getContext: (request: Request) => Readonly<Record<string, unknown>>;

  /**
   * 处理 HTTP 错误并记录详细的错误日志。
   *
   * 这是一个高级便捷方法，会自动从 `error` 中提取状态码、错误消息等信息，
   * 并格式化输出到日志中，适合在全局错误处理中间件中使用。
   *
   * @param request - 当前请求对象（必填）
   * @param error - 捕获的错误对象（必填），可以是 Error 实例、HTTPError 或任意值
   * @param store - 存储数据（必填），包含日志器等上下文信息
   * @param options - 可选的配置选项，可覆盖默认行为
   *
   * @example
   * ```typescript
   * // 在 Elysia 全局错误处理器中使用
   * app.onError(({ request, error, store }) => {
   *   store.logger.handleHttpError(request, error, store, {
   *     logLevel: 'error',
   *     includeStack: true
   *   });
   *   return { error: 'Internal Server Error' };
   * });
   * ```
   */
  handleHttpError: (
    request: Request,
    error: unknown,
    store: StoreData,
    options?: CreateElogsOptions
  ) => void;

  /**
   * 记录 INFO 级别的信息日志。
   *
   * 通常用于记录重要的业务事件或系统状态变化。
   *
   * @param request - 当前请求对象（必填），用于关联请求上下文
   * @param message - 信息消息（必填），描述事件
   * @param context - 可选，额外的上下文数据
   *
   * @example
   * ```typescript
   * logger.info(request, 'User logged in successfully', {
   *   userId: '123',
   *   loginMethod: 'oauth'
   * });
   * ```
   */
  info: (
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ) => void;

  /**
   * 记录指定级别的日志（通用方法）。
   *
   * 适用于需要动态指定日志级别的场景，比使用 `debug`、`info` 等快捷方法更灵活。
   *
   * @param level - 日志级别（必填），必须是 'debug' | 'info' | 'warn' | 'error' 之一
   * @param request - 当前请求对象（必填）
   * @param data - 要记录的日志数据对象（必填）
   * @param store - 存储数据（必填），包含日志器等上下文信息
   *
   * @example
   * ```typescript
   * const level = isProduction ? 'error' : 'debug';
   * logger.log(level, request, { event: 'UserAction', action: 'click' }, store);
   * ```
   */
  log: (
    level: LogLevel,
    request: Request,
    data: Record<string, unknown>,
    store: StoreData
  ) => void;

  /**
   * 合并额外的数据到当前请求的上下文中。
   *
   * 这些数据会在后续的 access log 中自动包含，非常适合在请求处理过程中
   * 逐步累积上下文信息（如经过认证后注入用户 ID）。
   *
   * @param request - 当前请求对象（必填）
   * @param partial - 要合并的部分上下文对象（必填），会与现有上下文进行浅合并
   *
   * @example
   * ```typescript
   * // 在认证中间件中记录用户信息
   * app.use(({ request, store }) => {
   *   const user = authenticate(request);
   *   store.logger.mergeContext(request, {
   *     userId: user.id,
   *     userRole: user.role,
   *     authenticated: true
   *   });
   *   // 这些数据会在后续的 access log 中自动出现
   * });
   * ```
   */
  mergeContext: (request: Request, partial: Record<string, unknown>) => void;

  /**
   * 底层的 Pino Logger 实例。
   *
   * 当内置方法无法满足需求时，可以直接访问 Pino 实例进行高级操作，
   * 如创建子 logger、使用 Pino 特定的 API 等。
   *
   * @example
   * ```typescript
   * // 创建子 logger 用于特定模块
   * const moduleLogger = logger.pino.child({ module: 'UserService' });
   * moduleLogger.info('UserService initialized');
   *
   * // 直接使用 Pino 的级别设置
   * logger.pino.level = 'debug';
   * ```
   */
  pino: Pino;

  /**
   * 记录 WARNING 级别的警告日志。
   *
   * 用于记录非致命的异常情况、过时功能的使用或潜在问题，
   * 需要关注但不至于立即影响系统运行。
   *
   * @param request - 当前请求对象（必填）
   * @param message - 警告消息（必填），描述警告内容
   * @param context - 可选，额外的上下文数据
   *
   * @example
   * ```typescript
   * logger.warn(request, 'Deprecated API version used', {
   *   apiVersion: 'v1',
   *   deprecatedSince: '2025-01-01',
   *   recommendedVersion: 'v2'
   * });
   * ```
   */
  warn: (
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ) => void;
}

/**
 * Request-scoped Logger,挂在 `context.log` 上,不需要传 request 参数。
 * 由 AsyncLocalStorage `useLogger()` 也能拿到(深调用栈场景)。
 * @internal
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

/**
 * 全局 Logger,通过 `globalLogger` 导出。
 *
 * - **请求作用域内**(Elysia 路由 handler / 中间件 / hook 调用栈):自动从
 *   AsyncLocalStorage 拿当前 request,走完整 emit 流水线(file/transports/console)。
 * - **请求作用域外**(模块初始化 / 后台任务 / 进程级错误兜底):降级为 pino 输出,
 *   首次降级时 `console.warn` 一次提示。
 *
 * 调用者**不需要**也不应该传 `request`。
 *
 * @example
 * ```typescript
 * import { globalLogger } from "@pori15/elogs";
 *
 * // 路由 handler / 中间件 / hook —— 自动走完整 emit
 * app.get("/user/:id", ({ params }) => {
 *   globalLogger.info("Fetching user", { userId: params.id });
 * });
 *
 * // 错误处理 —— Error 实例自动 unwrap .message + .stack
 * try {
 *   await db.query();
 * } catch (err) {
 *   globalLogger.error(err);
 * }
 * ```
 * @public
 */
export interface GlobalLogger {
  /**
   * 记录 DEBUG 级别日志。作用域内走完整 emit,作用域外走 pino。
   */
  debug: (message: string, context?: Record<string, unknown>) => void;

  /**
   * 记录 ERROR 级别日志。
   *
   * @param message - 字符串消息,或 Error 实例(自动 unwrap `.message` + `.stack` 进 context)
   * @param context - 附加上下文。当 `message` 是 Error 时,`stack` 和 `errorName` 会被自动
   *   合并进 context(除非 context 显式提供同名 key,显式值优先级更高)。
   */
  error: (message: string | Error, context?: Record<string, unknown>) => void;

  /**
   * 读取当前请求的累积上下文(作用域内有效)。
   * 作用域外返回 `{}`,首次调用时 `console.warn` 一次。
   */
  getContext: () => Readonly<Record<string, unknown>>;

  /**
   * 记录 INFO 级别日志。作用域内走完整 emit,作用域外走 pino。
   */
  info: (message: string, context?: Record<string, unknown>) => void;

  /**
   * 合并上下文到当前请求(作用域内有效)。
   * 作用域外为 noop,首次调用时 `console.warn` 一次。
   */
  mergeContext: (partial: Record<string, unknown>) => void;

  /**
   * 记录 WARNING 级别日志。作用域内走完整 emit,作用域外走 pino。
   */
  warn: (message: string, context?: Record<string, unknown>) => void;
}

/**
 * Elogs 请求上下文
 * @internal
 */
export interface ElogsContext {
  request: Request;
  store: ElogsStore;
}
