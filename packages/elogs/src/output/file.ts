/**
 * createElogs 2.0 — 文件日志出口
 *
 * 通过 FileSink 写入(句柄缓存 + 批写 + flushChain 串行化,见 `./file-sink.ts`),
 * 在每批 flush 完成后检查 rotation(由 FileSink 内部触发,本函数不直接做轮转)。
 *
 * rotation 配置兼容两种形态:
 * - 新版 `config.logRotation`
 * - legacy `file.rotation`
 */

import type {
  CreateElogsOptions,
  LogLevel,
  LogRotationConfig,
  StoreData,
} from "../interfaces";
import type { PrecomputedLogParts } from "../logger/create-logger";
import { getFileSink } from "./file-sink";

/** @internal */
export interface LogToFileInput {
  data: Record<string, unknown>;
  filePath: string;
  level: LogLevel;
  options: CreateElogsOptions;
  precomputed?: PrecomputedLogParts;
  request: Request;
  store: StoreData;
}

const resolveRotation = (
  options: CreateElogsOptions
): LogRotationConfig | undefined => {
  if (options.config?.logRotation) {
    return options.config.logRotation;
  }
  const fileConfig = options.file;
  if (
    fileConfig &&
    typeof fileConfig === "object" &&
    "rotation" in fileConfig
  ) {
    return fileConfig.rotation;
  }
};

/** @internal */
export const logToFile = async (input: LogToFileInput): Promise<void> => {
  const { filePath, level, request, data, store, options, precomputed } = input;
  const message = typeof data.message === "string" ? data.message : "";
  const before = store.beforeTime ?? BigInt(0);
  const durationMs = precomputed
    ? precomputed.durationMs
    : before === BigInt(0)
      ? 0
      : Number(process.hrtime.bigint() - before) / 1_000_000;
  const pathname =
    precomputed?.pathname ||
    store.pathname ||
    (() => {
      try {
        return new URL(request.url).pathname;
      } catch {
        return "/";
      }
    })();

  const line = `${level} ${durationMs.toFixed(2)}ms ${request.method} ${pathname} ${message}\n`;

  const rotation = resolveRotation(options);
  const sink = getFileSink(filePath);
  await sink.write(line, {
    logDirMode: options.config?.logDirMode,
    logFileMode: options.config?.logFileMode,
    logRotation: rotation,
  });
};
