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
  const logMessage = `${buildLogMessage(level, request, data, store, options, false)}\n`
  await fs.appendFile(filePath, logMessage, { flag: 'a' })
}
