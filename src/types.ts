interface RequestInfo {
  headers: { get: (key: string) => any }
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

interface Options {
  ip?: boolean
  customLogFormat?: string
}

export {
  RequestInfo,
  Server,
  ColorMap,
  LogLevel,
  LogData,
  Logger,
  StoreData,
  HttpError,
  Options
}
