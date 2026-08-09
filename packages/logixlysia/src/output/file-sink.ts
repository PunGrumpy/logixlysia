import type { FileHandle } from 'node:fs/promises'
import { open } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { LogRotationConfig } from '../interfaces'
import { parseSize } from '../utils/rotation'
import { ensureDir } from './fs'
import { performRotation } from './rotation-manager'

export interface FileSinkOptions {
  logDirMode?: number
  logFileMode?: number
  logRotation?: LogRotationConfig
}

export interface FileSink {
  /** Resolves after `line` is durably written to disk. */
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

class FileSinkImpl implements FileSink {
  private readonly filePath: string
  private handle: FileHandle | null = null
  private bytesWritten = 0
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

    return new Promise((resolve, reject) => {
      if (this.pendingBatch) {
        this.pendingBatch.lines.push(line)
        this.pendingBatch.resolvers.push({ reject, resolve })
        return
      }

      const batch: PendingBatch = {
        lines: [line],
        resolvers: [{ reject, resolve }]
      }
      this.pendingBatch = batch

      queueMicrotask(() => {
        this.pendingBatch = null
        this.flushChain = this.flushChain.then(
          () => this.flushBatch(batch),
          () => this.flushBatch(batch)
        )
      })
    })
  }

  private async flushBatch(batch: PendingBatch): Promise<void> {
    const options = this.latestOptions
    // Lines already carry their own trailing newline; join needs no separator.
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

    // Rotation (if triggered) is awaited before resolving so callers observe
    // a consistent on-disk state: the line's write plus any rotation it
    // caused. maybeRotate() catches and reports its own errors, so it never
    // rejects this chain.
    await this.maybeRotate(options)

    for (const resolver of batch.resolvers) {
      resolver.resolve()
    }
  }

  private async ensureOpen(options: FileSinkOptions): Promise<void> {
    if (this.handle) {
      return
    }

    // The directory only needs creating on first open (or on reopen after a
    // rotation cleared the handle) — never per line.
    await ensureDir(dirname(this.filePath), options.logDirMode)
    const handle = await open(this.filePath, 'a', options.logFileMode ?? 0o600)
    const stat = await handle.stat()
    this.handle = handle
    this.bytesWritten = stat.size
  }

  private async maybeRotate(options: FileSinkOptions): Promise<void> {
    const rotation = options.logRotation
    if (!rotation || rotation.maxSize === undefined) {
      return
    }

    try {
      const maxSize = parseSize(rotation.maxSize)
      if (this.bytesWritten <= maxSize) {
        return
      }

      const { handle } = this
      this.handle = null
      this.bytesWritten = 0
      await handle?.close()
      await performRotation(this.filePath, rotation)
    } catch (error) {
      // Log entries were already durably written and resolved above;
      // rotation failures must not fail the caller's write.
      console.error(
        `[logixlysia] Failed to rotate log file ${this.filePath}:`,
        error
      )
    }
  }

  // see plans/020: flush()/close() lifecycle would await `flushChain` here.
}

const sinks = new Map<string, FileSink>()

export const getFileSink = (filePath: string): FileSink => {
  let sink = sinks.get(filePath)
  if (!sink) {
    sink = new FileSinkImpl(filePath)
    sinks.set(filePath, sink)
  }
  return sink
}
