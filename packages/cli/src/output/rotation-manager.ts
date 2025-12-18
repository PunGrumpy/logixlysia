import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

import type { LogRotationConfig } from '../interfaces'
import {
  getRotatedFiles,
  parseInterval,
  parseRetention,
  parseSize,
  updateRotationTime
} from '../utils/rotation'

/**
 * Generate a rotated file name with timestamp
 * Example: app.log -> app.log.2025-10-10-14-30-45
 */
export const getRotatedFileName = (
  filePath: string,
  timestamp: Date
): string => {
  const year = timestamp.getFullYear()
  const month = String(timestamp.getMonth() + 1).padStart(2, '0')
  const day = String(timestamp.getDate()).padStart(2, '0')
  const hours = String(timestamp.getHours()).padStart(2, '0')
  const minutes = String(timestamp.getMinutes()).padStart(2, '0')
  const seconds = String(timestamp.getSeconds()).padStart(2, '0')

  return `${filePath}.${year}-${month}-${day}-${hours}-${minutes}-${seconds}`
}

/**
 * Rotate a log file by renaming it with a timestamp
 */
export const rotateFile = async (filePath: string): Promise<string> => {
  try {
    // Check if file exists and has content
    const stats = await fs.stat(filePath)
    if (stats.size === 0) {
      // Don't rotate empty files
      return ''
    }

    const rotatedPath = getRotatedFileName(filePath, new Date())
    await fs.rename(filePath, rotatedPath)
    updateRotationTime(filePath)

    return rotatedPath
  } catch (error) {
    // File doesn't exist or can't be rotated
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to rotate log file ${filePath}:`, error)
    }
    return ''
  }
}

/**
 * Compress a file using gzip
 */
export const compressFile = async (filePath: string): Promise<void> => {
  try {
    const compressedPath = `${filePath}.gz`
    const source = createReadStream(filePath)
    const destination = createWriteStream(compressedPath)
    const gzip = createGzip()

    await pipeline(source, gzip, destination)

    // Delete the original file after successful compression
    await fs.unlink(filePath)
  } catch (error) {
    console.error(`Failed to compress file ${filePath}:`, error)
  }
}

/**
 * Clean old rotated files based on retention policy
 */
export const cleanOldFiles = async (
  filePath: string,
  config: LogRotationConfig
): Promise<void> => {
  if (!config.maxFiles) {
    return
  }

  try {
    const rotatedFiles = await getRotatedFiles(filePath)
    if (rotatedFiles.length === 0) {
      return
    }

    const retention = parseRetention(config.maxFiles)

    if (retention.type === 'count') {
      // Keep only the specified number of files
      const filesToDelete = rotatedFiles.slice(retention.value)
      await Promise.all(filesToDelete.map(file => fs.unlink(file)))
    } else if (retention.type === 'time') {
      // Delete files older than the specified time
      const cutoffTime = Date.now() - retention.value
      const filesToDelete = await Promise.all(
        rotatedFiles.map(async file => {
          const stats = await fs.stat(file)
          return stats.mtime.getTime() < cutoffTime ? file : null
        })
      )

      await Promise.all(
        filesToDelete
          .filter((file): file is string => file !== null)
          .map(file => fs.unlink(file))
      )
    }
  } catch (error) {
    console.error(`Failed to clean old log files for ${filePath}:`, error)
  }
}

/**
 * Perform complete rotation: rotate, compress (if enabled), and clean old files
 */
export const performRotation = async (
  filePath: string,
  config: LogRotationConfig
): Promise<void> => {
  try {
    // Rotate the file
    const rotatedPath = await rotateFile(filePath)

    if (!rotatedPath) {
      return
    }

    // Compress if enabled (defaults to gzip)
    if (config.compress) {
      await compressFile(rotatedPath)
    }

    // Clean old files
    await cleanOldFiles(filePath, config)
  } catch (error) {
    console.error(`Failed to perform rotation for ${filePath}:`, error)
  }
}

/**
 * Check if rotation is needed based on configuration
 */
export const shouldRotate = async (
  filePath: string,
  config: LogRotationConfig
): Promise<boolean> => {
  try {
    // Check file existence
    await fs.access(filePath)
  } catch {
    // File doesn't exist, no rotation needed
    return false
  }

  // Check size-based rotation
  if (config.maxSize) {
    try {
      const maxSizeBytes = parseSize(config.maxSize)
      const stats = await fs.stat(filePath)
      if (stats.size >= maxSizeBytes) {
        return true
      }
    } catch (error) {
      console.error(`Failed to check file size for ${filePath}:`, error)
    }
  }

  // Check time-based rotation
  if (config.interval) {
    try {
      const intervalMs = parseInterval(config.interval)
      const stats = await fs.stat(filePath)
      const age = Date.now() - stats.mtimeMs
      if (age >= intervalMs) {
        return true
      }
    } catch (error) {
      // Log parse or stat errors and treat as no-op
      console.error(`Failed to check file age for ${filePath}:`, error)
    }
  }

  return false
}
