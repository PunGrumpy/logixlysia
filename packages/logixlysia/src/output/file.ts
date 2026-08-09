import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import { sanitizeLogText } from '../utils/sanitize'
import { getFileSink } from './file-sink'

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
            data: dataArg,
            filePath: filePathArg,
            level: levelArg,
            options: optionsArg,
            request: requestArg,
            store: storeArg
          }
        })()
      : args[0]

  const { filePath, level, request, data, store, options } = input
  const { config } = options
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
    const { pathname: rawPathname, search } = new URL(request.url)
    pathname = config?.logQueryParams ? `${rawPathname}${search}` : rawPathname
  } catch {
    // Fallback to raw URL if parsing fails
    pathname = request.url
  }

  const line = `${level} ${durationMs.toFixed(2)}ms ${request.method} ${sanitizeLogText(pathname, 1024)} ${sanitizeLogText(message)}\n`

  try {
    await getFileSink(filePath).write(line, {
      logDirMode: config?.logDirMode,
      logFileMode: config?.logFileMode,
      logRotation: config?.logRotation
    })
  } catch (error) {
    // Log file write errors to stderr so they're not completely silent
    console.error(
      `[logixlysia] Failed to write to log file ${filePath}:`,
      error
    )
    throw error
  }
}
