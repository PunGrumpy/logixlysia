import { appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import { ensureDir } from './fs'
import { performRotation, shouldRotate } from './rotation-manager'

interface LogToFileInput {
  filePath: string
  level: LogLevel
  request: RequestInfo
  data: Record<string, unknown>
  store: StoreData
  options: Options
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

  const line = `${level} ${durationMs.toFixed(2)}ms ${request.method} ${new URL(request.url).pathname} ${message}\n`

  await ensureDir(dirname(filePath))
  await appendFile(filePath, line, { encoding: 'utf-8' })

  const rotation = config?.logRotation
  if (!rotation) {
    return
  }

  const should = await shouldRotate(filePath, rotation)
  if (should) {
    await performRotation(filePath, rotation)
  }
}
