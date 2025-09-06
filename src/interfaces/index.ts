export interface RequestInfo {
  headers: { get: (key: string) => string | null }
  method: string
  url: string
}

export interface Server {
  hostname?: string
  port?: number
  protocol?: string
}

export interface ColorMap {
  [key: string]: (str: string) => string
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | string

export interface LogData {
  status?: number
  message?: string
  context?: Record<string, string | number | boolean | null>
  stack?: string
  metrics?: {
    memoryUsage?: number
    cpuUsage?: number
    responseSize?: number
  }
}

export interface Logger {
  store?: StoreData
  log(
    level: LogLevel,
    request: RequestInfo,
    data: LogData,
    store: StoreData
  ): void
  handleHttpError(
    request: RequestInfo,
    error: HttpError,
    store: StoreData
  ): Promise<void>
  customLogFormat?: string
  info(
    request: RequestInfo,
    message: string,
    context?: Record<string, string | number | boolean | null>,
    store?: StoreData
  ): void
  error(
    request: RequestInfo,
    message: string,
    context?: Record<string, string | number | boolean | null>,
    store?: StoreData
  ): void
  warn(
    request: RequestInfo,
    message: string,
    context?: Record<string, string | number | boolean | null>,
    store?: StoreData
  ): void
  debug(
    request: RequestInfo,
    message: string,
    context?: Record<string, string | number | boolean | null>,
    store?: StoreData
  ): void
}

export interface LogComponents {
  now: string
  epoch: string
  level: string
  duration: string
  method: string
  pathname: string | undefined
  status: string
  message: string
  context: string
  ip: string
}

export interface StoreData {
  beforeTime: bigint
  logger?: Logger
  hasCustomLog?: boolean // Used to skip automatic logging if there's a custom log
}

export interface LogixlysiaContext {
  store: {
    logger: Logger
    beforeTime: bigint
    hasCustomLog: boolean
  }
  request: RequestInfo
}

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type TransportFunction = (
  level: LogLevel,
  message: string,
  meta: {
    request: RequestInfo
    data: LogData
    store: StoreData
  }
) => Promise<void> | void

export interface Transport {
  log: TransportFunction
}

export interface TimestampConfig {
  translateTime?: boolean | string
}

export interface Options {
  config?: {
    customLogFormat?: string
    logFilePath?: string
    logRotation?: {
      maxSize?: number // in MB
      maxFiles?: number
      compress?: boolean
    }
    logFilter?: {
      level?: LogLevel | LogLevel[]
      method?: string | string[]
      status?: number | number[]
    } | null
    ip?: boolean
    useColors?: boolean
    showStartupMessage?: boolean
    startupMessageFormat?: 'banner' | 'simple'
    transports?: Transport[]
    timestamp?: TimestampConfig // Add this new option
    disableInternalLogger?: boolean // Add option to disable internal console logging
  }
}
