import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import type { LogRotationConfig } from "../interfaces";
import { pad2, pad3 } from "../utils/format";
import {
  getRotatedFiles,
  parseRetention,
  parseSize,
  shouldRotateBySize,
} from "../utils/rotation";
import { createKeyedMutex } from "./keyed-mutex";

const gzipAsync = promisify(gzip);

// Prevents concurrent compression of the same file (keyed by filePath).
const compressionLock = createKeyedMutex();

/**
 * Reports a sink failure; when omitted, the caller falls back to stderr.
 * @internal
 */
export type RotationErrorReporter = (error: unknown) => void;

const reportRotationError = (
  message: string,
  error: unknown,
  onError?: RotationErrorReporter
): void => {
  if (onError) {
    onError(error);
    return;
  }
  console.error(message, error);
};

/** @internal */
export const getRotatedFileName = (filePath: string, date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const MM = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const SSS = pad3(date.getMilliseconds());
  return `${filePath}.${yyyy}-${mm}-${dd}-${HH}-${MM}-${ss}-${SSS}`;
};

/** @internal */
export const rotateFile = async (filePath: string): Promise<string> => {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size === 0) {
      return "";
    }
  } catch {
    return "";
  }

  const baseRotated = getRotatedFileName(filePath, new Date());
  // Append hrtime nanoseconds for collision safety under concurrent rotations
  const rotated = `${baseRotated}-${process.hrtime.bigint()}`;
  await fs.rename(filePath, rotated);
  return rotated;
};

/** @internal */
export const compressFile = async (
  filePath: string,
  onError?: RotationErrorReporter
): Promise<void> => {
  const release = await compressionLock.acquire(filePath);
  try {
    // Check if file still exists (might have been compressed by another process)
    try {
      await fs.access(filePath);
    } catch {
      // File doesn't exist, already compressed or deleted
      return;
    }

    const content = await fs.readFile(filePath);
    const compressed = await gzipAsync(content);
    await fs.writeFile(`${filePath}.gz`, compressed);
    await fs.rm(filePath, { force: true });
  } catch (error) {
    reportRotationError(
      `[createElogs] Failed to compress file ${filePath}:`,
      error,
      onError
    );
    throw error;
  } finally {
    release();
  }
};

/** @internal */
export const shouldRotate = async (
  filePath: string,
  config: LogRotationConfig
): Promise<boolean> => {
  if (config.maxSize === undefined) {
    return false;
  }
  const maxSize = parseSize(config.maxSize);
  return await shouldRotateBySize(filePath, maxSize);
};

const cleanupByCount = async (
  filePath: string,
  maxFiles: number
): Promise<void> => {
  const rotated = await getRotatedFiles(filePath);
  if (rotated.length <= maxFiles) {
    return;
  }

  const stats = await Promise.all(
    rotated.map(async (p) => ({ path: p, stat: await fs.stat(p) }))
  );

  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const toDelete = stats.slice(maxFiles);
  await Promise.all(toDelete.map(({ path }) => fs.rm(path, { force: true })));
};

const cleanupByTime = async (
  filePath: string,
  maxAgeMs: number
): Promise<void> => {
  const rotated = await getRotatedFiles(filePath);
  if (rotated.length === 0) {
    return;
  }

  const now = Date.now();
  const stats = await Promise.all(
    rotated.map(async (p) => ({ path: p, stat: await fs.stat(p) }))
  );

  const toDelete = stats.filter(({ stat }) => now - stat.mtimeMs > maxAgeMs);
  await Promise.all(toDelete.map(({ path }) => fs.rm(path, { force: true })));
};

/** @internal */
export const performRotation = async (
  filePath: string,
  config: LogRotationConfig,
  onError?: RotationErrorReporter
): Promise<void> => {
  const rotated = await rotateFile(filePath);
  if (!rotated) {
    return;
  }

  const shouldCompress = config.compress === true;
  if (shouldCompress) {
    const algo = config.compression ?? "gzip";
    if (algo === "gzip") {
      try {
        await compressFile(rotated, onError);
      } catch {
        // compressFile already reported via onError
      }
    }
  }

  if (config.maxFiles !== undefined) {
    const retention = parseRetention(config.maxFiles);
    if (retention.type === "count") {
      await cleanupByCount(filePath, retention.value);
    } else {
      await cleanupByTime(filePath, retention.value);
    }
  }
};
