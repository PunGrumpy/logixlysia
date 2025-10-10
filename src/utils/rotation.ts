import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

export interface ParsedRetention {
  type: 'count' | 'time'
  value: number
}

// Regex patterns defined at top level for performance
const SIZE_PATTERN = /^(\d+(?:\.\d+)?)\s*([kmg])?b?$/
const INTERVAL_PATTERN = /^(\d+)\s*([hdw])$/
const RETENTION_PATTERN = /^(\d+)\s*d$/

/**
 * Parse size string to bytes
 * Supports: '10m', '1g', '100k', or raw number
 */
export function parseSize(size: string | number): number {
  if (typeof size === 'number') {
    return size
  }

  const units: Record<string, number> = {
    k: 1024,
    m: 1024 * 1024,
    g: 1024 * 1024 * 1024
  }

  const match = size.toLowerCase().match(SIZE_PATTERN)
  if (!match?.[1]) {
    throw new Error(`Invalid size format: ${size}`)
  }

  const value = Number.parseFloat(match[1])
  const unit = match[2] ?? ''

  return Math.floor(value * (units[unit] ?? 1))
}

/**
 * Parse interval string to milliseconds
 * Supports: '1h', '1d', '1w'
 */
export function parseInterval(interval: string): number {
  const units: Record<string, number> = {
    h: 60 * 60 * 1000, // hour
    d: 24 * 60 * 60 * 1000, // day
    w: 7 * 24 * 60 * 60 * 1000 // week
  }

  const match = interval.toLowerCase().match(INTERVAL_PATTERN)
  if (!match) {
    throw new Error(`Invalid interval format: ${interval}`)
  }

  const valueStr = match[1]
  const unit = match[2] as string

  if (!valueStr) {
    throw new Error(`Invalid interval format: ${interval}`)
  }
  if (!unit) {
    throw new Error(`Invalid interval format: ${interval}`)
  }

  const value = Number.parseInt(valueStr, 10)
  return value * (units[unit] ?? 0)
}

/**
 * Parse retention string or number
 * Returns object with type (count or time) and value
 */
export function parseRetention(retention: string | number): ParsedRetention {
  if (typeof retention === 'number') {
    return { type: 'count', value: retention }
  }

  // Check if it's a time-based retention (e.g., '7d', '30d')
  const match = retention.toLowerCase().match(RETENTION_PATTERN)
  if (match?.[1]) {
    const days = Number.parseInt(match[1], 10)
    return { type: 'time', value: days * 24 * 60 * 60 * 1000 } // convert to milliseconds
  }

  throw new Error(`Invalid retention format: ${retention}`)
}

/**
 * Check if file should be rotated based on size
 */
export async function shouldRotateBySize(
  filePath: string,
  maxSize: number
): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath)
    return stats.size >= maxSize
  } catch {
    // File doesn't exist or can't be accessed
    return false
  }
}

/**
 * Get the last rotation time for a file
 * Uses file modification time as a proxy
 */
async function getLastRotationTime(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath)
    return stats.mtime.getTime()
  } catch {
    // File doesn't exist, use current time
    return Date.now()
  }
}

// Track last rotation times in memory to avoid excessive file checks
const rotationTimeCache = new Map<string, number>()

/**
 * Check if file should be rotated based on time interval
 */
export async function shouldRotateByTime(
  filePath: string,
  interval: number
): Promise<boolean> {
  const now = Date.now()

  // Check cache first
  const cachedTime = rotationTimeCache.get(filePath)
  if (cachedTime) {
    return now - cachedTime >= interval
  }

  // Get last rotation time from file
  const lastRotation = await getLastRotationTime(filePath)
  rotationTimeCache.set(filePath, lastRotation)

  return now - lastRotation >= interval
}

/**
 * Update the last rotation time in cache
 */
export function updateRotationTime(filePath: string): void {
  rotationTimeCache.set(filePath, Date.now())
}

/**
 * Get rotated files for a given log file
 */
export async function getRotatedFiles(filePath: string): Promise<string[]> {
  const dir = dirname(filePath)
  const baseName = filePath.split('/').pop() || ''

  try {
    const files = await fs.readdir(dir)
    // Match files like: app.log.2025-10-10, app.log.2025-10-10.gz
    const rotatedPattern = new RegExp(
      `^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d{4}-\\d{2}-\\d{2}(-\\d{2}-\\d{2}-\\d{2})?(\\.gz)?$`
    )
    const rotatedFiles = files
      .filter(file => rotatedPattern.test(file))
      .map(file => join(dir, file))

    // Sort by modification time (newest first)
    const filesWithStats = await Promise.all(
      rotatedFiles.map(async file => {
        const stats = await fs.stat(file)
        return { file, mtime: stats.mtime.getTime() }
      })
    )

    return filesWithStats
      .sort((a, b) => b.mtime - a.mtime)
      .map(item => item.file)
  } catch {
    return []
  }
}
