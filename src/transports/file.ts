import { promises as fs } from 'fs'
import { dirname } from 'path'

import { buildLogMessage } from '../core/buildLogMessage'
import { LogData, LogLevel, Options, RequestInfo, StoreData } from '../types'

const dirCache = new Set<string>()

async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = dirname(filePath)
  if (!dirCache.has(dir)) {
    await fs.mkdir(dir, { recursive: true })
    dirCache.add(dir)
  }
}

export async function logToFile(
  filePath: string,
  level: LogLevel,
  request: RequestInfo,
  data: LogData,
  store: StoreData,
  options?: Options
): Promise<void> {
  await ensureDirectoryExists(filePath)
  const logMessage =
    buildLogMessage(level, request, data, store, options, false) + '\n'
  await fs.appendFile(filePath, logMessage, { flag: 'a' })
}
