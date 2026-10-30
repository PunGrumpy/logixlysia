import type { FileHandle } from 'node:fs/promises'
import { open } from 'node:fs/promises'
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

const sinks = new Map<string, FileSink>()

class FileSinkImpl implements FileSink {
  private readonly filePath: string
  private handle: FileHandle | null = null
  private bytesWritten = 0
  private openedAt = 0
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
      const handle = this.handle as FileHandle
      await handle.write(text)
      this.bytesWritten += Buffer.byteLength(text)
    } catch (error) {
      for (const resolver of batch.resolvers) {
        resolver.reject(error)
      }
      return
    }

    await this.maybeRotate(options)

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
    this.openedAt = resolveOpenedAt(stat.birthtimeMs, Date.now())
  }

  private shouldRotateNow(rotation: LogRotationConfig): boolean {
    if (
      rotation.maxSize !== undefined &&
      this.bytesWritten > parseSize(rotation.maxSize)
    ) {
      return true
    }
    return (
      rotation.interval !== undefined &&
      Date.now() - this.openedAt >= parseInterval(rotation.interval)
    )
  }

  private async maybeRotate(options: FileSinkOptions): Promise<void> {
    const rotation = options.logRotation
    if (
      !rotation ||
      (rotation.maxSize === undefined && rotation.interval === undefined)
    ) {
      return
    }

    try {
      if (!this.shouldRotateNow(rotation)) {
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
    await this.flush()
    const { handle } = this
    this.handle = null
    await handle?.close()
    sinks.delete(this.filePath)
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
