import type {
  Logger as PinoLogger,
  LoggerOptions as PinoLoggerOptions
} from 'pino'

export type Pino = PinoLogger<never, boolean>

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

export type StoreData = {
  beforeTime: bigint
}

export type LogixlysiaStore = {
  logger: Logger
  pino: Pino
  beforeTime?: bigint
  [key: string]: unknown
}

export type Transport = {
  log: (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ) => void | Promise<void>
}

export type LogRotationConfig = {
  /**
   * Max log file size before rotation, e.g. '10m', '5k', or a byte count.
   */
  maxSize?: string | number
  /**
   * Keep at most N files or keep files for a duration like '7d'.
   */
  maxFiles?: number | string
  /**
   * Rotate at a fixed interval, e.g. '1d', '12h'.
   */
  interval?: string
  compress?: boolean
  compression?: 'gzip'
}

export type Options = {
  config?: {
    showStartupMessage?: boolean
    startupMessageFormat?: 'simple' | 'banner'
    useColors?: boolean
    ip?: boolean
    timestamp?: {
      translateTime?: string
    }
    customLogFormat?: string

    // Outputs
    transports?: Transport[]
    useTransportsOnly?: boolean
    disableInternalLogger?: boolean
    disableFileLogging?: boolean
    logFilePath?: string
    logRotation?: LogRotationConfig

    // Pino
    pino?: (PinoLoggerOptions & { prettyPrint?: boolean }) | undefined
  }
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type Logger = {
  pino: Pino
  log: (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ) => void
  handleHttpError: (
    request: RequestInfo,
    error: unknown,
    store: StoreData
  ) => void
  debug: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
  info: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
  warn: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
  error: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
}

export type LogixlysiaContext = {
  request: Request
  store: LogixlysiaStore
}
