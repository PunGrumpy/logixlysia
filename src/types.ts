interface RequestInfo {
  headers: { get: (key: string) => string | null }
  method: string
  url: string
}

interface Server {
  hostname?: string
  port?: number
  protocol?: string
}

interface ColorMap {
  [key: string]: (str: string) => string
}

type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | string

interface LogData {
  status?: number
  message?: string
}

interface Logger {
  log(
    level: LogLevel,
    request: RequestInfo,
    data: LogData,
    store: StoreData
  ): void
  customLogFormat?: string
}

interface StoreData {
  beforeTime: bigint
}

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface TransportFunction {
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

interface Transport {
  log: TransportFunction
}

interface Options {
  config?: {
    customLogFormat?: string
    logFilePath?: string
    logFilter?: {
      level?: LogLevel | LogLevel[]
      method?: string | string[]
      status?: number | number[]
    } | null
    ip?: boolean
    showBanner?: boolean
    transports?: Transport[]
  }
}

export {
  ColorMap,
  HttpError,
  LogData,
  Logger,
  LogLevel,
  Options,
  RequestInfo,
  Server,
  StoreData,
  Transport,
  TransportFunction
}
