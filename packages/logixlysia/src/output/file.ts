import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LogLevel, Options, StoreData } from "../interfaces";
import { ensureDir } from "./fs";
import { performRotation, shouldRotate } from "./rotation-manager";

interface LogToFileInput {
  data: Record<string, unknown>;
  filePath: string;
  level: LogLevel;
  options: Options;
  request: Request;
  store: StoreData;
}

export const logToFile = async (input: LogToFileInput): Promise<void> => {
  const { filePath, level, request, data, store, options } = input;
  const message = typeof data.message === "string" ? data.message : "";
  const durationMs =
    store.beforeTime === BigInt(0)
      ? 0
      : Number(process.hrtime.bigint() - store.beforeTime) / 1_000_000;

  const pathname = store.pathname || new URL(request.url).pathname;
  const line = `${level} ${durationMs.toFixed(2)}ms ${request.method} ${pathname} ${message}\n`;

  await ensureDir(dirname(filePath));
  await appendFile(filePath, line, { encoding: "utf-8" });

  const rotation = options.file ? options.file.rotation : undefined;
  if (!rotation) {
    return;
  }

  const should = await shouldRotate(filePath, rotation);
  if (should) {
    await performRotation(filePath, rotation);
  }
};
