/**
 * createElogs 2.0 — Transports 出口
 *
 * 把日志转送到用户注册的 transports(Elasticsearch/Slack/... 等),
 * 同步 throw / 异步 Promise reject 都被吞掉(永不阻塞 logger 流程),
 * 错误按 transport 5s 窗口节流,防止 sink 故障刷屏。
 */

import type { LogLevel, StoreData, Transport } from "../interfaces";
import type { PrecomputedLogParts } from "../logger/create-logger";

interface LogToTransportsInput {
  data: Record<string, unknown>;
  level: LogLevel;
  precomputed?: PrecomputedLogParts;
  request: Request;
  store: StoreData;
  transports: Transport[];
}

const DEFAULT_THROTTLE_MS = 5000;

const lastErrorAt = new WeakMap<Transport, number>();

const shouldThrottle = (
  transport: Transport,
  now: number,
  windowMs: number
): boolean => {
  const last = lastErrorAt.get(transport);
  if (last === undefined) {
    return false;
  }
  return now - last < windowMs;
};

const reportTransportError = (transport: Transport, error: unknown): void => {
  const now = Date.now();
  if (shouldThrottle(transport, now, DEFAULT_THROTTLE_MS)) {
    return;
  }
  lastErrorAt.set(transport, now);
  console.error("[createElogs] transport error", error);
};

/** @internal */
export const logToTransports = (input: LogToTransportsInput): void => {
  const { level, request, data, precomputed, store, transports } = input;
  if (transports.length === 0) {
    return;
  }

  const message = typeof data.message === "string" ? data.message : "";
  // Upstream main omits the BigInt `beforeTime` from the transport meta so
  // the payload is JSON-serializable. We expose `durationMs` and `pathname`
  // instead — both already JSON-safe.
  const meta: Record<string, unknown> = {
    request: {
      method: request.method,
      url: request.url,
    },
    ...data,
  };
  if (precomputed) {
    meta.durationMs = precomputed.durationMs;
    meta.pathname = precomputed.pathname;
  } else {
    // Fall back to a derived duration when caller didn't precompute.
    const before = store.beforeTime ?? BigInt(0);
    meta.durationMs =
      before === BigInt(0)
        ? 0
        : Number(process.hrtime.bigint() - before) / 1_000_000;
  }

  for (const transport of transports) {
    try {
      const result = transport.log(level, message, meta);
      if (
        result &&
        typeof (result as { catch?: unknown }).catch === "function"
      ) {
        (result as Promise<void>).catch((err) => {
          reportTransportError(transport, err);
        });
      }
    } catch (err) {
      reportTransportError(transport, err);
    }
  }
};
