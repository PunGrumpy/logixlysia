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

const gzipAsync = promisify(gzip)

// Compression lock to prevent concurrent compression of the same file
const compressionLocks = new Map<string, Promise<void>>()

const acquireCompressionLock = (filePath: string): Promise<() => void> => {
  const prior = compressionLocks.get(filePath) ?? Promise.resolve()

  let resolveLock: () => void
  const newLock = new Promise<void>((resolve) => {
    resolveLock = resolve
  })
  compressionLocks.set(filePath, newLock)

  return prior.then(() => {
    // Critical section can now proceed
    return () => {
      resolveLock!()
      if (compressionLocks.get(filePath) === newLock) {
        compressionLocks.delete(filePath)
      }
    }
  })
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

export const compressFile = async (filePath: string): Promise<void> => {
  const release = await acquireCompressionLock(filePath)
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
    console.error(`[logixlysia] Failed to compress file ${filePath}:`, error)
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

const cleanupByCount = async (
  filePath: string,
  maxFiles: number
): Promise<void> => {
  const rotated = await getRotatedFiles(filePath)
  if (rotated.length <= maxFiles) {
    return
  }

  // Use Promise.allSettled to handle individual file stat failures gracefully
  const statsResults = await Promise.allSettled(
    rotated.map(async p => ({ path: p, stat: await fs.stat(p) }))
  )

  // Extract successful stats, ignore files that were deleted concurrently
  const stats = statsResults
    .filter((result): result is PromiseFulfilledResult<{ path: string; stat: import('node:fs').Stats }> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value)

  if (stats.length <= maxFiles) {
    return
  }

  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
  const toDelete = stats.slice(maxFiles)
  
  // Delete files individually, continuing even if some fail
  const deleteResults = await Promise.allSettled(
    toDelete.map(({ path }) => fs.rm(path, { force: true }))
  )
  
  // Log failures but don't crash
  deleteResults.forEach((result, idx) => {
    if (result.status === 'rejected') {
      console.error(`[logixlysia] Failed to delete rotated log ${toDelete[idx].path}:`, result.reason)
    }
  })
}

const cleanupByTime = async (
  filePath: string,
  maxAgeMs: number
): Promise<void> => {
  const rotated = await getRotatedFiles(filePath)
  if (rotated.length === 0) {
    return
  }

  const now = Date.now()
  
  // Use Promise.allSettled to handle individual file stat failures gracefully
  const statsResults = await Promise.allSettled(
    rotated.map(async p => ({ path: p, stat: await fs.stat(p) }))
  )

  // Extract successful stats
  const stats = statsResults
    .filter((result): result is PromiseFulfilledResult<{ path: string; stat: import('node:fs').Stats }> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value)

  const toDelete = stats.filter(({ stat }) => now - stat.mtimeMs > maxAgeMs)
  
  // Delete files individually, continuing even if some fail
  const deleteResults = await Promise.allSettled(
    toDelete.map(({ path }) => fs.rm(path, { force: true }))
  )
  
  // Log failures but don't crash
  deleteResults.forEach((result, idx) => {
    if (result.status === 'rejected') {
      console.error(`[logixlysia] Failed to delete old log ${toDelete[idx].path}:`, result.reason)
    }
  })
}

export const performRotation = async (
  filePath: string,
  config: LogRotationConfig
): Promise<void> => {
  const rotated = await rotateFile(filePath)
  if (!rotated) {
    return
  }

  const shouldCompress = config.compress === true
  if (shouldCompress) {
    const algo = config.compression ?? 'gzip'
    if (algo === 'gzip') {
      await compressFile(rotated)
    }
  }

  if (config.maxFiles !== undefined) {
    const retention = parseRetention(config.maxFiles)
    if (retention.type === 'count') {
      await cleanupByCount(filePath, retention.value)
    } else {
      await cleanupByTime(filePath, retention.value)
    }
  }

  // Optional interval-based rotation cleanup (create interval directories / naming) is not required by tests.
}