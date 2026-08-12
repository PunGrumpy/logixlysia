/**
 * logixlysia 2.0 — 公共类型
 *
 * 重写于 Elysia 2.0(2.0.0-exp.62)适配:
 * - 删除:ErrorConfig / ErrorMapping / ErrorResolver / Code / HttpErrorConstructor / ProblemConfig / ProblemDocument / ErrorMeta
 * - 简化:Logger.handleHttpError 第二个参数从 ProblemError 改为 unknown
 * - 新增:LogixlysiaOptions.errors 数组(用户自定义 HTTPError 类)
 */

import type { TaggedHTTPError } from "elysia";
import type {
  Logger as PinoLogger,
  LoggerOptions as PinoLoggerOptions,
} from "pino";

/** Pino Logger 实例类型 */
export type Pino = PinoLogger<never, boolean>;

/** 日志级别 */
export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";

/** 单次请求携带的计时和路径数据 */
export interface StoreData {
  /** 请求开始的纳秒时间戳（hrtime） */
  beforeTime: bigint;
  /** 缓存的 URL pathname，避免重复解析 */
  pathname: string;
}

/** Elysia store 中挂载的 logixlysia 状态 */
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

// ==========================================
// Options
// ==========================================

/** 启动消息配置 */
export interface StartupConfig {
  /** 启动消息格式，默认 `"banner"` */
  format?: "simple" | "banner";
  /** 是否显示启动消息，默认 `true` */
  show?: boolean;
}

/** 日志格式配置 */
export interface FormatConfig {
  /** 是否启用彩色输出，默认 `true`（仅 TTY） */
  colors?: boolean;
  /** 是否在日志中显示请求 IP，默认 `false` */
  showIp?: boolean;
  /** 自定义日志模板，如 `'🦊 {now} {level} {method} {pathname} {status}'` */
  template?: string;
  /** 时间戳格式，如 `'yyyy-mm-dd HH:MM:ss.SSS'` */
  timestamp?: string;
}

/** 文件日志配置 */
export interface FileConfig {
  /** 日志文件路径（必填） */
  path: string;
  /** 日志轮转配置 */
  rotation?: LogRotationConfig;
}

/** 自定义传输配置 */
export interface TransportsConfig {
  /** 设为 `true` 时只使用 transports，禁用控制台和文件输出 */
  only?: boolean;
  /** 传输目标列表 */
  targets: Transport[];
}

/** 错误处理配置（logixlysia 2.0 极简版） */
export interface ErrorConfig {
  /** 是否在控制台显示完整错误详情，默认 `false` */
  verbose?: boolean;
}

/**
 * 用户自定义 HTTPError 类列表
 *
 * 这些类会通过 Elysia 2.0 的 `.error(Class, handler)` 逐个注册,
 * logixlysia 在 handler 内写日志,响应交还给 Elysia(自动 application/problem+json)。
 *
 * 用 `logixlysia.errorMap(...)` 工厂可以快速从 `{ code: { status, title } }` 字典生成。
 */
export type LogixlysiaErrorClasses = TaggedHTTPError<string, any>[];

/** Logixlysia 插件配置 */
export interface LogixlysiaOptions {
  /** 错误处理配置 */
  error?: ErrorConfig;
  /**
   * 用户自定义 HTTPError 类（Elysia 2.0 原生）
   * 抛这些类的实例会被 logixlysia 记录 + Elysia 自动以 application/problem+json 响应
   */
  errors?: LogixlysiaErrorClasses;
  /** 文件日志配置，设为 `false` 禁用文件日志 */
  file?: false | FileConfig;
  /** 日志格式配置 */
  format?: FormatConfig;
  /** 日志级别过滤，接受单个级别或级别数组 */
  logLevel?: LogLevel | LogLevel[];
  /** Pino Logger 原生配置透传 */
  pino?: PinoLoggerOptions;
  /** 启动消息配置 */
  startup?: StartupConfig;
  /** 自定义传输（数组或带 `only` 选项的对象） */
  transports?: Transport[] | TransportsConfig;
}

/**
 * 向后兼容别名 —— logixlysia 内部模块继续用 `Options` 这个短名
 * @deprecated 推荐使用 `LogixlysiaOptions`
 */
export type Options = LogixlysiaOptions;

// ==========================================
// Logger
// ==========================================

/** Logger 实例，可通过 `store.logger` 访问 */
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
  /**
   * 处理 HTTP 错误并输出日志
   *
   * 2.0 接受 `unknown`（任意错误对象）；logixlysia 内部从 error.status / error.message / HTTPError.toResponse() 推断
   */
  handleHttpError: (
    request: Request,
    error: unknown,
    store: StoreData,
    options: LogixlysiaOptions
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
  /** 底层 Pino Logger 实例 */
  pino: Pino;
  /** 记录 WARNING 级别日志 */
  warn: (
    request: Request,
    message: string,
    context?: Record<string, unknown>
  ) => void;
}

/** Logixlysia 请求上下文 */
export interface LogixlysiaContext {
  request: Request;
  store: LogixlysiaStore;
}
