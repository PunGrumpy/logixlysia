import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { dirname } from "node:path";
import type { LogRotationConfig } from "../interfaces";
import { parseInterval, parseSize } from "../utils/rotation";
import { ensureDir } from "./fs";
import { performRotation } from "./rotation-manager";

/**
 * The live file's creation time when the filesystem reports one;
 * some filesystems report 0/absent birthtime — fall back to `now`
 * (losing restart-survival for the interval clock, but never wrong
 * by more than the process lifetime).
 * @internal
 */
export const resolveOpenedAt = (
  birthtimeMs: number | undefined,
  now: number
): number => (birthtimeMs && birthtimeMs > 0 ? birthtimeMs : now);

/** @internal */
export interface FileSinkOptions {
  logDirMode?: number;
  logFileMode?: number;
  logRotation?: LogRotationConfig;
  /** Reports a rotation-sink failure; falls back to a stderr line when omitted. */
  onRotationError?: (error: unknown) => void;
}

/** @internal */
export interface FileSink {
  /** Resolves after `line` is durably written to disk. */
  write: (line: string, options: FileSinkOptions) => Promise<void>;
}

interface BatchResolver {
  reject: (error: unknown) => void;
  resolve: () => void;
}

interface PendingBatch {
  lines: string[];
  resolvers: BatchResolver[];
}

class FileSinkImpl implements FileSink {
  private readonly filePath: string;
  private handle: FileHandle | null = null;
  private bytesWritten = 0;
  private openedAt = 0;
  private latestOptions: FileSinkOptions = {};
  private pendingBatch: PendingBatch | null = null;
  // Serializes flush and rotation work per path: every batch (and the
  // rotation it may trigger) is chained onto this so at most one holder of
  // the file handle is doing I/O at a time.
  private flushChain: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  write(line: string, options: FileSinkOptions): Promise<void> {
    // Always use the latest call's options, in case config differs between
    // calls to the same path (e.g. in tests).
    this.latestOptions = options;

    return new Promise((resolve, reject) => {
      if (this.pendingBatch) {
        this.pendingBatch.lines.push(line);
        this.pendingBatch.resolvers.push({ reject, resolve });
        return;
      }

      const batch: PendingBatch = {
        lines: [line],
        resolvers: [{ reject, resolve }],
      };
      this.pendingBatch = batch;

      queueMicrotask(() => {
        this.pendingBatch = null;
        this.flushChain = this.flushChain.then(
          () => this.flushBatch(batch),
          () => this.flushBatch(batch)
        );
      });
    });
  }

  private async flushBatch(batch: PendingBatch): Promise<void> {
    const options = this.latestOptions;
    // Lines already carry their own trailing newline; join needs no separator.
    const text = batch.lines.join("");

    try {
      await this.ensureOpen(options);
      const handle = this.handle as FileHandle;
      await handle.write(text);
      this.bytesWritten += Buffer.byteLength(text);
    } catch (error) {
      for (const resolver of batch.resolvers) {
        resolver.reject(error);
      }
      return;
    }

    // Rotation (if triggered) is awaited before resolving so callers observe
    // a consistent on-disk state: the line's write plus any rotation it
    // caused. maybeRotate() catches and reports its own errors, so it never
    // rejects this chain.
    await this.maybeRotate(options);

    for (const resolver of batch.resolvers) {
      resolver.resolve();
    }
  }

  private async ensureOpen(options: FileSinkOptions): Promise<void> {
    if (this.handle) {
      return;
    }

    // The directory only needs creating on first open (or on reopen after a
    // rotation cleared the handle) — never per line.
    await ensureDir(dirname(this.filePath), options.logDirMode);
    const handle = await open(this.filePath, "a", options.logFileMode ?? 0o600);
    const stat = await handle.stat();
    this.handle = handle;
    this.bytesWritten = stat.size;
    this.openedAt = resolveOpenedAt(stat.birthtimeMs, Date.now());
  }

  /** True when either configured trigger (size, interval) has been crossed. */
  private shouldRotateNow(rotation: LogRotationConfig): boolean {
    if (
      rotation.maxSize !== undefined &&
      this.bytesWritten > parseSize(rotation.maxSize)
    ) {
      return true;
    }
    return (
      rotation.interval !== undefined &&
      Date.now() - this.openedAt >= parseInterval(rotation.interval)
    );
  }

  private async maybeRotate(options: FileSinkOptions): Promise<void> {
    const rotation = options.logRotation;
    if (
      !rotation ||
      (rotation.maxSize === undefined && rotation.interval === undefined)
    ) {
      return;
    }

    try {
      if (!this.shouldRotateNow(rotation)) {
        return;
      }

      const { handle } = this;
      this.handle = null;
      this.bytesWritten = 0;
      this.openedAt = Date.now();
      await handle?.close();
      await performRotation(this.filePath, rotation, options.onRotationError);
    } catch (error) {
      // Log entries were already durably written and resolved above;
      // rotation failures must not fail the caller's write.
      if (options.onRotationError) {
        options.onRotationError(error);
      } else {
        console.error(
          `[createElogs] Failed to rotate log file ${this.filePath}:`,
          error
        );
      }
    }
  }
}

const sinks = new Map<string, FileSink>();

/** @internal */
export const getFileSink = (filePath: string): FileSink => {
  let sink = sinks.get(filePath);
  if (!sink) {
    sink = new FileSinkImpl(filePath);
    sinks.set(filePath, sink);
  }
  return sink;
};
