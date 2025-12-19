import { promises as fs } from 'node:fs'
import { basename, dirname } from 'node:path'

const SIZE_REGEX = /^(\d+(?:\.\d+)?)(k|kb|m|mb|g|gb)$/i
const INTERVAL_REGEX = /^(\d+)(h|d|w)$/i
const ROTATED_REGEX = /\.(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})(?:\.gz)?$/

export const parseSize = (value: number | string): number => {
  if (typeof value === 'number') {
    return value
  }

  const trimmed = value.trim()
  const asNumber = Number(trimmed)
  if (Number.isFinite(asNumber)) {
    return asNumber
  }

  const match = trimmed.match(SIZE_REGEX)
  if (!match) {
    throw new Error(`Invalid size format: ${value}`)
  }

  const amount = Number(match[1])
  const unit = match[2].toLowerCase()

  let base = 1024
  if (unit.startsWith('m')) {
    base = 1024 * 1024
  } else if (unit.startsWith('g')) {
    base = 1024 * 1024 * 1024
  }

  return Math.floor(amount * base)
}

export const parseInterval = (value: string): number => {
  const match = value.trim().match(INTERVAL_REGEX)
  if (!match) {
    throw new Error(`Invalid interval format: ${value}`)
  }

  const amount = Number(match[1])
  const unit = match[2].toLowerCase()

  let ms = 60 * 60 * 1000
  if (unit === 'd') {
    ms = 24 * 60 * 60 * 1000
  } else if (unit === 'w') {
    ms = 7 * 24 * 60 * 60 * 1000
  }

  return amount * ms
}

export const parseRetention = (
  value: number | string
): { type: 'count' | 'time'; value: number } => {
  if (typeof value === 'number') {
    return { type: 'count', value }
  }
  return { type: 'time', value: parseInterval(value) }
}

export const shouldRotateBySize = async (
  filePath: string,
  maxSizeBytes: number
): Promise<boolean> => {
  try {
    const stat = await fs.stat(filePath)
    return stat.size > maxSizeBytes
  } catch {
    return false
  }
}

export const getRotatedFiles = async (filePath: string): Promise<string[]> => {
  const dir = dirname(filePath)
  const base = basename(filePath)

  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }

  return entries
    .filter(name => name.startsWith(`${base}.`) && ROTATED_REGEX.test(name))
    .map(name => `${dir}/${name}`)
}
