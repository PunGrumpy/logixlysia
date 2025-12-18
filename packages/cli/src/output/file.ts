import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

import type {
  LogData,
  LogLevel,
  Options,
  RequestInfo,
  StoreData
} from '../interfaces'
import { buildLogMessage } from '../logger/build-log-message'
import { parseInterval, shouldRotateByTime } from '../utils/rotation'
import { performRotation, shouldRotate } from './rotation-manager'

const dirCache = new Set<string>()

const ensureDirectoryExists = async (filePath: string): Promise<void> => {
  const dir = dirname(filePath)
  if (!dirCache.has(dir)) {
    await fs.mkdir(dir, { recursive: true })
    dirCache.add(dir)
  }
}

/**
 * Check if rotation is needed and perform it
 */
const checkAndRotate = async (
  filePath: string,
  options?: Options
): Promise<void> => {
  const rotationConfig = options?.config?.logRotation
  if (!rotationConfig) {
    return
  }

  let needsRotation = false

  // Check size-based rotation
  if (rotationConfig.maxSize) {
    needsRotation = await shouldRotate(filePath, rotationConfig)
  }

  // Check time-based rotation
  if (!needsRotation && rotationConfig.interval) {
    try {
      const intervalMs = parseInterval(rotationConfig.interval)
      needsRotation = await shouldRotateByTime(filePath, intervalMs)
    } catch (error) {
      console.error('Invalid interval format in log rotation config:', error)
    }
  }

  // Perform rotation if needed
  if (needsRotation) {
    await performRotation(filePath, rotationConfig)
  }
}

export type LogToFileArgs = {
  filePath: string
  level: LogLevel
  request: RequestInfo
  data: LogData
  store: StoreData
  options?: Options
}

export const logToFile = async ({
  filePath,
  level,
  request,
  data,
  store,
  options
}: LogToFileArgs): Promise<void> => {
  await ensureDirectoryExists(filePath)

  // Check and perform rotation if needed
  await checkAndRotate(filePath, options)

  const logMessage = `${buildLogMessage({
    level,
    request,
    data,
    store,
    options,
    useColors: false
  })}\n`
  await fs.appendFile(filePath, logMessage, { flag: 'a' })
}
