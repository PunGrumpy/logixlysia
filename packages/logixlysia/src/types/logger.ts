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

/** The shape of a request's context bag. Widen it per app to type your fields. */
export type LogFields = Record<string, unknown>

/**
 * The per-request logger derived onto the Elysia context as `log`.
 *
 * Parameterise the plugin with your own field type to have TypeScript reject
 * misspelled or unexpected keys at compile time, which keeps a field from
 * arriving as `userId` on one route and `user_id` on the next:
 *
 * ```ts
 * interface CheckoutFields {
 *   cartId: string
 *   userId: string
 * }
 *
 * new Elysia().use(logixlysia<CheckoutFields>()).post('/pay', ({ log }) => {
 *   log.mergeContext({ userId: user.id })
 *   log.mergeContext({ user_id: user.id }) // ✗ not in CheckoutFields
 * })
 * ```
 *
 * The default keeps every key allowed, so untyped code is unaffected. This is
 * type-only: nothing changes at runtime.
 */
export interface RequestScopedLogger<TFields extends object = LogFields> {
  debug: (message: string, context?: Partial<TFields>) => void
  error: (message: string, context?: Partial<TFields>) => void
  info: (message: string, context?: Partial<TFields>) => void
  mergeContext: (partial: Partial<TFields>) => void
  warn: (message: string, context?: Partial<TFields>) => void
}
