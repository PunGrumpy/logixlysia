import type { FileHandle } from 'node:fs/promises'
import { lstat, open, rm } from 'node:fs/promises'
import path from 'node:path'
import type { LogRotationConfig } from '../interfaces'
import { parseInterval, parseSize } from '../utils/rotation'
import { settle } from '../utils/settle'
import { ensureDir } from './fs'
import { performRotation } from './rotation-manager'

/**
 * The live file's creation time when the filesystem reports one. Some
 * filesystems report 0 or no birthtime; then `now` is used, so the interval
 * clock restarts at open and rotation can run late by the file's age.
 */
export const resolveOpenedAt = (
  birthtimeMs: number | undefined,
  now: number
): number => (birthtimeMs && birthtimeMs > 0 ? birthtimeMs : now)

export interface FileSinkOptions {
  logDirMode?: number
  logFileMode?: number
  logRotation?: LogRotationConfig
  onRotationError?: (error: unknown) => void
}

export interface FileSink {
  close: () => Promise<void>
  /** Resolves once every write issued so far has been written to the file. */
  flush: () => Promise<void>
  /** Resolves after `line` has been written to the file. */
  write: (line: string, options: FileSinkOptions) => Promise<void>
}

interface BatchResolver {
  reject: (error: unknown) => void
  resolve: () => void
}

interface PendingBatch {
  lines: string[]
  resolvers: BatchResolver[]
}

type RotationTrigger = 'interval' | 'size'

const sinks = new Map<string, FileSink>()

class FileSinkImpl implements FileSink {
  private readonly filePath: string
  private handle: FileHandle | null = null
  private bytesWritten = 0
  private openedAt = 0
  // Set when an expired empty file was replaced. The new file's birthtime is
  // the wall clock, which can lag a test clock, so the period starts at now.
  private restartInterval = false
  private rotationFailed = false
  private latestOptions: FileSinkOptions = {}
  private pendingBatch: PendingBatch | null = null
  // Serializes flush and rotation work per path: every batch (and the
  // rotation it may trigger) is chained onto this so at most one holder of
  // the file handle is doing I/O at a time.
  private flushChain: Promise<void> = Promise.resolve()

  constructor(filePath: string) {
    this.filePath = filePath
  }

  write(line: string, options: FileSinkOptions): Promise<void> {
    // Always use the latest call's options, in case config differs between
    // calls to the same path (e.g. in tests).
    this.latestOptions = options

    const { promise, reject, resolve }: PromiseWithResolvers<void> =
      Promise.withResolvers()

    if (this.pendingBatch) {
      this.pendingBatch.lines.push(line)
      this.pendingBatch.resolvers.push({ reject, resolve })
      return promise
    }

    const batch: PendingBatch = {
      lines: [line],
      resolvers: [{ reject, resolve }]
    }
    this.pendingBatch = batch

    queueMicrotask(() => {
      this.pendingBatch = null
      this.flushChain = this.flushAfter(this.flushChain, batch)
    })

    return promise
  }

  private async flushAfter(
    prior: Promise<void>,
    batch: PendingBatch
  ): Promise<void> {
    await settle(prior)
    await this.flushBatch(batch)
  }

  private async flushBatch(batch: PendingBatch): Promise<void> {
    const options = this.latestOptions
    const text = batch.lines.join('')

    try {
      await this.ensureOpen(options)
      // A line belongs in the file of the period it was written in, so an
      // elapsed interval rotates before the batch is written.
      await this.maybeRotate(options, 'interval')
      await this.ensureOpen(options)
      const handle = this.handle as FileHandle
      await handle.write(text)
      this.bytesWritten += Buffer.byteLength(text)
    } catch (error) {
      for (const resolver of batch.resolvers) {
        resolver.reject(error)
      }
      return
    }

    await this.maybeRotate(options, 'size')

    for (const resolver of batch.resolvers) {
      resolver.resolve()
    }
  }

  private async ensureOpen(options: FileSinkOptions): Promise<void> {
    if (this.handle) {
      return
    }

    await ensureDir(path.dirname(this.filePath), options.logDirMode)
    const handle = await open(this.filePath, 'a', options.logFileMode ?? 0o600)
    const stat = await handle.stat()
    this.handle = handle
    this.bytesWritten = this.rotationFailed ? 0 : stat.size
    this.rotationFailed = false
    this.openedAt = this.restartInterval
      ? Date.now()
      : resolveOpenedAt(stat.birthtimeMs, Date.now())
    this.restartInterval = false
  }

  private shouldRotateNow(
    rotation: LogRotationConfig,
    trigger: RotationTrigger
  ): boolean {
    if (trigger === 'size') {
      return (
        rotation.maxSize !== undefined &&
        this.bytesWritten > parseSize(rotation.maxSize)
      )
    }
    return (
      rotation.interval !== undefined &&
      Date.now() - this.openedAt >= parseInterval(rotation.interval)
    )
  }

  private async emptyLiveFile(): Promise<boolean> {
    if (!this.handle) {
      return false
    }
    const stat = await this.handle.stat()
    return stat.size === 0
  }

  // An empty regular file is not archived. Replacing it drops the old
  // creation time, so the next write is not archived as if another interval
  // had elapsed. The path is removed only when it still names this handle:
  // a symlink, or a file swapped in at the same path, is left alone.
  private async replaceExpiredEmptyFile(): Promise<void> {
    const { handle } = this
    if (!handle) {
      return
    }
    const openStat = await handle.stat()
    let sameFile = false
    try {
      const pathStat = await lstat(this.filePath)
      sameFile =
        pathStat.isFile() &&
        pathStat.dev === openStat.dev &&
        pathStat.ino === openStat.ino
    } catch {
      sameFile = false
    }
    if (!sameFile) {
      this.openedAt = Date.now()
      return
    }
    this.handle = null
    this.bytesWritten = 0
    await handle.close()
    await rm(this.filePath, { force: true })
    this.restartInterval = true
  }

  private async maybeRotate(
    options: FileSinkOptions,
    trigger: RotationTrigger
  ): Promise<void> {
    const rotation = options.logRotation
    if (
      !rotation ||
      (rotation.maxSize === undefined && rotation.interval === undefined)
    ) {
      return
    }

    try {
      if (!this.shouldRotateNow(rotation, trigger)) {
        return
      }

      if (trigger === 'interval' && (await this.emptyLiveFile())) {
        await this.replaceExpiredEmptyFile()
        return
      }

      const { handle } = this
      this.handle = null
      this.bytesWritten = 0
      this.openedAt = Date.now()
      await handle?.close()
      await performRotation(
        this.filePath,
        rotation,
        options.onRotationError,
        options.logFileMode
      )
    } catch (error) {
      this.rotationFailed = true
      if (options.onRotationError) {
        options.onRotationError(error)
      } else {
        console.error(
          `[logixlysia] Failed to rotate log file ${this.filePath}:`,
          error
        )
      }
    }
  }

  async flush(): Promise<void> {
    // write() chains onto flushChain from a microtask, so yield once before
    // reading the chain or a write issued in the same tick would be missed.
    await Promise.resolve()
    await this.flushChain
  }

  async close(): Promise<void> {
    // Same yield as flush(): a batch still pending when close() was called,
    // including lines that join it later in this tick, is chained ahead of
    // the close. A write that starts a new batch after this call goes behind.
    await Promise.resolve()
    const closed = this.closeAfter(this.flushChain)
    // A handle that fails to close rejects this call, not a later flush().
    const step = settle(closed)
    this.flushChain = step
    await closed
    // A write issued while the handle was closing is queued behind that step
    // and reopens the file, so the sink stays registered for the next close.
    const idle = this.flushChain === step && this.pendingBatch === null
    if (idle && sinks.get(this.filePath) === this) {
      sinks.delete(this.filePath)
    }
  }

  private async closeAfter(prior: Promise<void>): Promise<void> {
    await settle(prior)
    const { handle } = this
    this.handle = null
    await handle?.close()
  }
}

export const getFileSink = (filePath: string): FileSink => {
  const resolved = path.resolve(filePath)
  let sink = sinks.get(resolved)
  if (!sink) {
    sink = new FileSinkImpl(resolved)
    sinks.set(resolved, sink)
  }
  return sink
}

export const flushAllFileSinks = async (): Promise<void> => {
  await Promise.allSettled([...sinks.values()].map(sink => sink.flush()))
}

export const closeAllFileSinks = async (): Promise<void> => {
  await Promise.allSettled([...sinks.values()].map(sink => sink.close()))
}
