import type { Stats } from 'node:fs'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import type { promisify as Promisify } from 'node:util'
import type { gzip as Gzip } from 'node:zlib'
import type { LogRotationConfig } from '../interfaces'
import {
  getRotatedFiles,
  parseRetention,
  parseSize,
  shouldRotateBySize
} from '../utils/rotation'
import { createKeyedMutex } from './keyed-mutex'

// Required on first use because only a rotation that compresses needs them.
// A dynamic import() would do, but the bundler then links its runtime chunk
// into every entry, the dependency-free `logixlysia/errors` included. A
// CommonJS bundle leaves import.meta.url undefined, so createRequire throws
// here, where compressFile reports it, and not when the package is imported.
const gzipAsync = async (content: Buffer): Promise<Buffer> => {
  const requireBuiltin = createRequire(import.meta.url)
  const util = requireBuiltin('node:util') as { promisify: typeof Promisify }
  const zlib = requireBuiltin('node:zlib') as { gzip: typeof Gzip }
  return await util.promisify(zlib.gzip)(content)
}

const DEFAULT_FILE_MODE = 0o600

const compressionLock = createKeyedMutex()

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
  onError?: RotationErrorReporter,
  fileMode = DEFAULT_FILE_MODE
): Promise<void> => {
  const release = await compressionLock.acquire(filePath)
  try {
    try {
      await fs.access(filePath)
    } catch {
      return
    }

    const content = await fs.readFile(filePath)
    const compressed = await gzipAsync(content)
    await fs.writeFile(`${filePath}.gz`, compressed, { mode: fileMode })
    await fs.rm(filePath, { force: true })
  } catch (error) {
    reportRotationError(
      `[logixlysia] Failed to compress file ${filePath}:`,
      error,
      onError
    )
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
  stat: Stats
}

// The archive name ends in `-<hrtime>` (and maybe `.gz`). Equal mtimes need
// that counter, because directory order is not age.
const rotationCounter = (filePath: string): bigint => {
  const withoutGz = filePath.endsWith('.gz') ? filePath.slice(0, -3) : filePath
  const dash = withoutGz.lastIndexOf('-')
  if (dash === -1) {
    return 0n
  }
  const suffix = withoutGz.slice(dash + 1)
  if (!/^\d+$/u.test(suffix)) {
    return 0n
  }
  return BigInt(suffix)
}

const compareRotated = (a: FileStat, b: FileStat): number => {
  const byTime = b.stat.mtimeMs - a.stat.mtimeMs
  if (byTime !== 0) {
    return byTime
  }
  const byCounter = rotationCounter(b.path) - rotationCounter(a.path)
  if (byCounter > 0n) {
    return 1
  }
  if (byCounter < 0n) {
    return -1
  }
  return 0
}

const stampRotated = async (
  rotated: string,
  onError?: RotationErrorReporter
): Promise<void> => {
  try {
    const rotatedAt = new Date()
    await fs.utimes(rotated, rotatedAt, rotatedAt)
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined
    if (code === 'EPERM' || code === 'EACCES') {
      return
    }
    reportRotationError(
      `[logixlysia] Failed to stamp rotated log ${rotated}:`,
      error,
      onError
    )
  }
}

const isFulfilled = <T>(
  result: PromiseSettledResult<T>
): result is PromiseFulfilledResult<T> => result.status === 'fulfilled'

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

  const statsResults = await Promise.allSettled(
    rotated.map(async p => ({ path: p, stat: await fs.stat(p) }))
  )

  const stats = statsResults.filter(isFulfilled<FileStat>).map(r => r.value)

  let toDelete: FileStat[]
  if (retention.type === 'count') {
    if (stats.length <= retention.value) {
      return
    }
    stats.sort((a, b) => compareRotated(a, b))
    toDelete = stats.slice(retention.value)
  } else {
    const now = Date.now()
    toDelete = stats.filter(({ stat }) => now - stat.mtimeMs > retention.value)
  }

  const deleteResults = await Promise.allSettled(
    toDelete.map(({ path }) => fs.rm(path, { force: true }))
  )

  for (const [idx, result] of deleteResults.entries()) {
    if (result.status === 'rejected') {
      reportRotationError(
        `[logixlysia] Failed to delete rotated log ${toDelete[idx].path}:`,
        result.reason,
        onError
      )
    }
  }
}

export const performRotation = async (
  filePath: string,
  config: LogRotationConfig,
  onError?: RotationErrorReporter,
  fileMode = DEFAULT_FILE_MODE
): Promise<void> => {
  const rotated = await rotateFile(filePath)
  if (!rotated) {
    return
  }

  // rename keeps the live file's mtime. A file that sat longer than maxFiles
  // would be deleted in the cleanup below, in the same call that archived it.
  // Stamping is best-effort: a group-writable log can be renamed by a process
  // that is not allowed to set timestamps, and that must not skip compression.
  await stampRotated(rotated, onError)

  const shouldCompress = config.compress === true
  if (shouldCompress) {
    const algo = config.compression ?? 'gzip'
    if (algo === 'gzip') {
      await compressFile(rotated, onError, fileMode)
    }
  }

  if (config.maxFiles !== undefined) {
    const retention = parseRetention(config.maxFiles)
    await cleanupRotated(filePath, retention, onError)
  }
}
