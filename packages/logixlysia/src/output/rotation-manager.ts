import type { Stats } from 'node:fs'
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
  stat: Stats
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
    stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
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

  const shouldCompress = config.compress === true
  if (shouldCompress) {
    const algo = config.compression ?? 'gzip'
    if (algo === 'gzip') {
      try {
        await compressFile(rotated, onError, fileMode)
      } catch {
        // compressFile already reported this error via onError/console.error;
        // swallow the rethrow here so retention cleanup below still runs and
        // the failure isn't reported a second time by the caller's catch.
      }
    }
  }

  if (config.maxFiles !== undefined) {
    const retention = parseRetention(config.maxFiles)
    await cleanupRotated(filePath, retention, onError)
  }
}
