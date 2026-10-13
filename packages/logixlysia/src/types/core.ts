import type { Logger as PinoLogger } from 'pino'
import type { Logger } from './logger'

export type Pino = PinoLogger<never, boolean>

export type RequestInfo = Request

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

export interface StoreData {
  beforeTime: bigint
  /** The status the client received, when the caller resolved it. `handleHttpError` prefers it over the thrown value. */
  status?: number
}

export interface LogixlysiaStore {
  beforeTime?: bigint
  logger: Logger
  pino: Pino
}

export interface LogixlysiaContext {
  request: Request
  store: LogixlysiaStore
}
