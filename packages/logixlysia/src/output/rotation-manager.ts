import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import type { LogRotationConfig } from '../interfaces'
import {
  getRotatedFiles,
  parseRetention,
  parseSize,
  shouldRotateBySize
} from '../utils/rotation'
import { createKeyedMutex } from './keyed-mutex'

const gzipAsync = promisify(gzip)

// Prevents concurrent compression of the same file (keyed by filePath).
const compressionLock = createKeyedMutex()

/** Reports a sink failure; when omitted, the caller falls back to stderr. */
export type RotationErrorReporter = (error: unknown) => void

const reportRotationError = (
  message: string,
  error: unknown,
  onError?: RotationErrorReporter
): void => {
  if (onError) {
    onError(error)
    return
  }
  console.error(message, error)
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

export const getRotatedFileName = (filePath: string, date: Date): string => {
  const yyyy = date.getFullYear()
  const mm = pad2(date.getMonth() + 1)
  const dd = pad2(date.getDate())
  const HH = pad2(date.getHours())
  const MM = pad2(date.getMinutes())
  const ss = pad2(date.getSeconds())
  const SSS = String(date.getMilliseconds()).padStart(3, '0')
  return `${filePath}.${yyyy}-${mm}-${dd}-${HH}-${MM}-${ss}-${SSS}`
}

export const rotateFile = async (filePath: string): Promise<string> => {
  try {
    const stat = await fs.stat(filePath)
    if (stat.size === 0) {
      return ''
    }
  } catch {
    return ''
  }

  const baseRotated = getRotatedFileName(filePath, new Date())
  const rotated = `${baseRotated}-${process.hrtime.bigint()}`
  await fs.rename(filePath, rotated)
  return rotated
}

export const compressFile = async (
  filePath: string,
  onError?: RotationErrorReporter
): Promise<void> => {
  const release = await compressionLock.acquire(filePath)
  try {
    // Check if file still exists (might have been compressed by another process)
    try {
      await fs.access(filePath)
    } catch {
      // File doesn't exist, already compressed or deleted
      return
    }

    const content = await fs.readFile(filePath)
    const compressed = await gzipAsync(content)
    await fs.writeFile(`${filePath}.gz`, compressed)
    await fs.rm(filePath, { force: true })
  } catch (error) {
    reportRotationError(
      `[logixlysia] Failed to compress file ${filePath}:`,
      error,
      onError
    )
    throw error
  } finally {
    release()
  }
}

export const shouldRotate = async (
  filePath: string,
  config: LogRotationConfig
): Promise<boolean> => {
  if (config.maxSize === undefined) {
    return false
  }
  const maxSize = parseSize(config.maxSize)
  return await shouldRotateBySize(filePath, maxSize)
}

interface FileStat {
  path: string
  stat: import('node:fs').Stats
}

const isFulfilled = <T>(
  result: PromiseSettledResult<T>
): result is PromiseFulfilledResult<T> => result.status === 'fulfilled'

/**
 * Deletes rotated files beyond `retention`: for `'count'`, keeps the newest
 * `retention.value` files (by mtime); for `'time'`, deletes files older than
 * `retention.value` ms. Individual stat/delete failures are tolerated (via
 * `allSettled`) so one bad file never blocks cleanup of the rest.
 */
const cleanupRotated = async (
  filePath: string,
  retention: { type: 'count' | 'time'; value: number },
  onError?: RotationErrorReporter
): Promise<void> => {
  const rotated = await getRotatedFiles(filePath)
  if (rotated.length === 0) {
    return
  }
  if (retention.type === 'count' && rotated.length <= retention.value) {
    return
  }

  // Use Promise.allSettled to handle individual file stat failures gracefully
  const statsResults = await Promise.allSettled(
    rotated.map(async p => ({ path: p, stat: await fs.stat(p) }))
  )

  // Extract successful stats, ignore files that were deleted concurrently
  const stats = statsResults.filter(isFulfilled<FileStat>).map(r => r.value)

  let toDelete: FileStat[]
  if (retention.type === 'count') {
    if (stats.length <= retention.value) {
      return
    }
    stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    toDelete = stats.slice(retention.value)
  } else {
    const now = Date.now()
    toDelete = stats.filter(({ stat }) => now - stat.mtimeMs > retention.value)
  }

  // Delete files individually, continuing even if some fail
  const deleteResults = await Promise.allSettled(
    toDelete.map(({ path }) => fs.rm(path, { force: true }))
  )

  // Log failures but don't crash
  deleteResults.forEach((result, idx) => {
    if (result.status === 'rejected') {
      reportRotationError(
        `[logixlysia] Failed to delete rotated log ${toDelete[idx].path}:`,
        result.reason,
        onError
      )
    }
  })
}

export const performRotation = async (
  filePath: string,
  config: LogRotationConfig,
  onError?: RotationErrorReporter
): Promise<void> => {
  const rotated = await rotateFile(filePath)
  if (!rotated) {
    return
  }

  const shouldCompress = config.compress === true
  if (shouldCompress) {
    const algo = config.compression ?? 'gzip'
    if (algo === 'gzip') {
      await compressFile(rotated, onError)
    }
  }

  if (config.maxFiles !== undefined) {
    const retention = parseRetention(config.maxFiles)
    await cleanupRotated(filePath, retention, onError)
  }

  // `config.interval` (fixed-interval rotation, e.g. '1d'/'12h') is not
  // implemented here: rotation is currently only triggered by `maxSize`
  // (see `FileSinkImpl.maybeRotate` in file-sink.ts).
}
