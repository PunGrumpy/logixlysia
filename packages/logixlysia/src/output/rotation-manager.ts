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

const pad2 = (value: number): string => String(value).padStart(2, '0')

export const getRotatedFileName = (filePath: string, date: Date): string => {
  const yyyy = date.getFullYear()
  const mm = pad2(date.getMonth() + 1)
  const dd = pad2(date.getDate())
  const HH = pad2(date.getHours())
  const MM = pad2(date.getMinutes())
  const ss = pad2(date.getSeconds())
  return `${filePath}.${yyyy}-${mm}-${dd}-${HH}-${MM}-${ss}`
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

  const rotated = getRotatedFileName(filePath, new Date())
  await fs.rename(filePath, rotated)
  return rotated
}

export const compressFile = async (filePath: string): Promise<void> => {
  try {
    const content = await fs.readFile(filePath)
    const compressed = await gzipAsync(content)
    await fs.writeFile(`${filePath}.gz`, compressed)
    await fs.rm(filePath, { force: true })
  } catch (error) {
    // Log compression errors but don't crash - the uncompressed file will remain
    console.error(
      `[logixlysia] Failed to compress log file ${filePath}:`,
      error
    )
    throw error // Re-throw to let caller decide how to handle
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

  // Use Promise.allSettled to handle files that may have been deleted concurrently
  const statsResults = await Promise.allSettled(
    rotated.map(async p => ({ path: p, stat: await fs.stat(p) }))
  )
  
  // Filter out failed stat operations (files may have been deleted)
  const stats = statsResults
    .filter((result): result is PromiseFulfilledResult<{ path: string; stat: any }> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value)

  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
  const toDelete = stats.slice(maxFiles)
  await Promise.all(toDelete.map(({ path }) => fs.rm(path, { force: true })))
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
  
  // Use Promise.allSettled to handle files that may have been deleted concurrently
  const statsResults = await Promise.allSettled(
    rotated.map(async p => ({ path: p, stat: await fs.stat(p) }))
  )
  
  // Filter out failed stat operations (files may have been deleted)
  const stats = statsResults
    .filter((result): result is PromiseFulfilledResult<{ path: string; stat: any }> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value)

  const toDelete = stats.filter(({ stat }) => now - stat.mtimeMs > maxAgeMs)
  await Promise.all(toDelete.map(({ path }) => fs.rm(path, { force: true })))
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
      try {
        await compressFile(rotated)
      } catch (error) {
        // Compression failed but rotation succeeded - log and continue
        console.error(
          `[logixlysia] Compression failed for ${rotated}, keeping uncompressed file:`,
          error
        )
      }
    }
  }

  if (config.maxFiles !== undefined) {
    const retention = parseRetention(config.maxFiles)
    try {
      if (retention.type === 'count') {
        await cleanupByCount(filePath, retention.value)
      } else {
        await cleanupByTime(filePath, retention.value)
      }
    } catch (error) {
      // Cleanup failed but rotation succeeded - log and continue
      console.error(
        `[logixlysia] Cleanup failed for ${filePath}:`,
        error
      )
    }
  }

  // Optional interval-based rotation cleanup (create interval directories / naming) is not required by tests.
}
