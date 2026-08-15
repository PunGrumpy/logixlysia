/**
 * createElogs 2.0 — Transport 组合器
 *
 * `Transport` 接口只有一个 `log` 方法。组合器都是**纯函数**:
 *   (Transport) => Transport 或 (args, Transport) => Transport
 *
 * 方便像 pino 的 multi-stream 那样把多个 transport 串起来。
 *
 * @example
 * ```ts
 * import { createElogs } from "@pori15/elogs";
 * import { sample, filter, tap, batch, tee } from "@pori15/elogs";
 *
 * const consoleTarget = { log: (lvl, msg, meta) => console.log(lvl, msg) };
 * const metricsTarget = { log: (lvl, msg, meta) => metrics.increment(...) };
 *
 * createElogs({
 *   config: {
 *     transports: [
 *       // 10% 采样后送 metrics,100% 送 console
 *       tee([
 *         sample(0.1, metricsTarget),
 *         filter((lvl) => lvl === "ERROR", consoleTarget),
 *       ]),
 *     ],
 *   },
 * });
 * ```
 */

import type { LogLevel, Transport } from "../interfaces";

/**
 * 单条 log 的最小元组(给 batch/dedupe 等组合器用)
 * @internal
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

// ==========================================================
// 1. tee — 多路 fan-out
// ==========================================================

/**
 * 把一条 log 同时发到多个 transport。每个分支都跑,互不影响。
 * 任一分支 reject 不会短路其它分支(用 Promise.allSettled 兜底)。
 * @internal
 */
export const tee = (targets: Transport[]): Transport => ({
  log: (level, message, meta) => {
    const results = targets.map((t) => {
      try {
        return Promise.resolve(t.log(level, message, meta));
      } catch (err) {
        return Promise.reject(err);
      }
    });
    // 吞掉单个失败,不让一个 transport 拖垮其它
    return Promise.allSettled(results).then(() => undefined);
  },
});

// ==========================================================
// 2. sample — 概率采样
// ==========================================================

/**
 * 以 `rate` (0-1) 的概率把 log 转发给 `transport`。
 * `rate=0` 完全丢弃;`rate=1` 等于直通;`rate=0.1` 采样 10%。
 * @internal
 */
export const sample = (rate: number, transport: Transport): Transport => {
  if (!(rate >= 0 && rate <= 1)) {
    throw new Error(`createElogs: sample rate must be in [0, 1], got ${rate}`);
  }
  return {
    log: (level, message, meta) =>
      Math.random() < rate ? transport.log(level, message, meta) : undefined,
  };
};

// ==========================================================
// 3. filter — 谓词过滤
// ==========================================================

/**
 * 仅当 `predicate(level, message, meta)` 返回 truthy 时才转发。
 * 常见用法:`filter((lvl) => lvl === "ERROR", errorTarget)`。
 * @internal
 */
export const filter = (
  predicate: (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ) => boolean,
  transport: Transport
): Transport => ({
  log: (level, message, meta) =>
    predicate(level, message, meta)
      ? transport.log(level, message, meta)
      : undefined,
});

// ==========================================================
// 4. tap — 旁路,不影响主链路
// ==========================================================

/**
 * 对每条 log 跑 `fn`,然后**总是**转发给 `transport`。
 * 适合打 metrics / 计数 / 调试 trace,**绝不**用来丢日志(用 `filter`)。
 * @internal
 */
export const tap = (
  fn: (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ) => void,
  transport: Transport
): Transport => ({
  log: (level, message, meta) => {
    try {
      fn(level, message, meta);
    } catch {
      // tap 失败不能影响主链路 —— 静默吞
    }
    return transport.log(level, message, meta);
  },
});

// ==========================================================
// 5. batch — 批量缓冲
// ==========================================================

/**
 * 缓冲 log 直到满 `size` 条或距首条 `flushMs` 毫秒,触发后作为一条
 * "batch" 转发给 `transport`,`meta.entries` 是缓冲数组。
 *
 * 适合打到远程服务(每次 HTTP 请求成本高)。
 *
 * **注意**:程序退出时未刷的 buffer 会丢 —— 自己 `process.on("beforeExit", ...)` 调
 * `(transport as { flush?: () => void }).flush?.()`(如果 transport 暴露了 flush)。
 * @internal
 */
export const batch = (
  size: number,
  flushMs: number,
  transport: Transport
): Transport => {
  if (size <= 0) {
    throw new Error(`createElogs: batch size must be > 0, got ${size}`);
  }
  if (flushMs <= 0) {
    throw new Error(`createElogs: batch flushMs must be > 0, got ${flushMs}`);
  }

  let buffer: LogEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (buffer.length === 0) {
      return;
    }
    const entries = buffer;
    buffer = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void transport.log("INFO", "batch", { entries });
  };

  return {
    // 暴露 flush 给用户手动触发(比如 beforeExit / 测试结束)
    flush: flush as never,
    log: (level, message, meta) => {
      buffer.push({ level, message, meta });
      if (buffer.length >= size) {
        flush();
      } else if (!timer) {
        timer = setTimeout(flush, flushMs);
      }
    },
  } as Transport;
};
