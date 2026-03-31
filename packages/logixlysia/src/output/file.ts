import { appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import { ensureDir } from './fs'
import { performRotation, shouldRotate } from './rotation-manager'

// Per-file mutex to prevent race conditions during rotation
const fileLocks = new Map<string, Promise<void>>()

const acquireLock = (filePath: string): Promise<() => void> => {
  const prior = fileLocks.get(filePath) ?? Promise.resolve()

  let resolveLock: () => void
  const newLock = new Promise<void>((resolve) => {
    resolveLock = resolve
  })
  fileLocks.set(filePath, newLock)

  return prior.then(() => {
    // Critical section can now proceed
    return () => {
      resolveLock!()
      if (fileLocks.get(filePath) === newLock) {
        fileLocks.delete(filePath)
      }
    }
  })
}

interface LogToFileInput {
  data: Record<string, unknown>
  filePath: string
  level: LogLevel
  options: Options
  request: RequestInfo
  store: StoreData
}

export const logToFile = async (
  ...args:
    | [LogToFileInput]
    | [
        string,
        LogLevel,
        RequestInfo,
        Record<string, unknown>,
        StoreData,
        Options
      ]
): Promise<void> => {
  const input: LogToFileInput =
    typeof args[0] === 'string'
      ? (() => {
          const [
            filePathArg,
            levelArg,
            requestArg,
            dataArg,
            storeArg,
            optionsArg
          ] = args as [
            string,
            LogLevel,
            RequestInfo,
            Record<string, unknown>,
            StoreData,
            Options
          ]
          return {
            filePath: filePathArg,
            level: levelArg,
            request: requestArg,
            data: dataArg,
            store: storeArg,
            options: optionsArg
          }
        })()
      : args[0]

  const { filePath, level, request, data, store, options } = input
  const config = options.config
  const useTransportsOnly = config?.useTransportsOnly === true
  const disableFileLogging = config?.disableFileLogging === true
  if (useTransportsOnly || disableFileLogging) {
    return
  }

  const message = typeof data.message === 'string' ? data.message : ''
  const durationMs =
    store.beforeTime === BigInt(0)
      ? 0
      : Number(process.hrtime.bigint() - store.beforeTime) / 1_000_000

  // Safely parse URL to avoid crashes on malformed URLs
  let pathname = '/'
  try {
    pathname = new URL(request.url).pathname
  } catch {
    // Fallback to raw URL if parsing fails
    pathname = request.url
  }

  const line = `${level} ${durationMs.toFixed(2)}ms ${request.method} ${pathname} ${message}\n`

  // Acquire lock before any file operations to prevent race conditions
  const releaseLock = await acquireLock(filePath)

  try {
    try {
      await ensureDir(dirname(filePath))
      await appendFile(filePath, line, { encoding: 'utf-8' })
    } catch (error) {
      // Log file write errors to stderr so they're not completely silent
      console.error(`[logixlysia] Failed to write to log file ${filePath}:`, error)
      throw error
    }

    const rotation = config?.logRotation
    if (!rotation) {
      return
    }

    const should = await shouldRotate(filePath, rotation)
    if (should) {
      try {
        await performRotation(filePath, rotation)
      } catch (error) {
        // Log rotation errors but don't crash - log entry was already written
        console.error(`[logixlysia] Failed to rotate log file ${filePath}:`, error)
      }
    }
  } finally {
    // Release lock
    releaseLock()
  }
}