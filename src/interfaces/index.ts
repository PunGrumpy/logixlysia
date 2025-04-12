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

export type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | string

export interface LogData {
  status?: number
  message?: string
}

export interface Logger {
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
  ): void
  customLogFormat?: string
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
  ip: string
}

export interface StoreData {
  beforeTime: bigint
}

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface TransportFunction {
  (
    level: LogLevel,
    message: string,
    meta: {
      request: RequestInfo
      data: LogData
      store: StoreData
    }
  ): Promise<void> | void
}

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
  }
}
