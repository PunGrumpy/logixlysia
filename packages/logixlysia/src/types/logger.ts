import type { LogLevel, Pino, RequestInfo, StoreData } from './core'

export interface Logger {
  /**
   * Opens a request for tail sampling. Without it, records this request drops
   * to head sampling are discarded rather than buffered. No-op when sampling
   * is off.
   */
  beginRequest: (request: RequestInfo) => void
  debug: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
  error: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
  /**
   * Closes a request opened by {@link Logger.beginRequest} and resolves its
   * tail-sampling verdict, replaying buffered records when the outcome
   * matches. Call it before the request's final log line. No-op when sampling
   * is off.
   */
  finalizeRequest: (
    request: RequestInfo,
    store: StoreData,
    status: number
  ) => void
  getContext: (key: RequestInfo | object) => Readonly<Record<string, unknown>>
  handleHttpError: (
    request: RequestInfo,
    error: unknown,
    store: StoreData
  ) => void
  info: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
  log: (
    level: LogLevel,
    request: RequestInfo,
    data: Record<string, unknown>,
    store: StoreData
  ) => void
  mergeContext: (
    key: RequestInfo | object,
    partial: Record<string, unknown>
  ) => void
  pino: Pino
  warn: (
    request: RequestInfo,
    message: string,
    context?: Record<string, unknown>
  ) => void
}

export interface RequestScopedLogger {
  debug: (message: string, context?: Record<string, unknown>) => void
  error: (message: string, context?: Record<string, unknown>) => void
  info: (message: string, context?: Record<string, unknown>) => void
  mergeContext: (partial: Record<string, unknown>) => void
  warn: (message: string, context?: Record<string, unknown>) => void
}
