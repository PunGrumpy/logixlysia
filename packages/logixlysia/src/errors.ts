/** The client-safe view of an {@link HttpError} — everything but `internal`. */
export interface HttpErrorPayload {
  code?: string
  fix?: string
  link?: string
  message: string
  status: number
  why?: string
}

export interface HttpErrorInit {
  /**
   * Stable, machine-readable identifier the client can branch on, e.g.
   * `PAYMENT_DECLINED`. Unlike `message`, it is safe to depend on: rewording
   * the message does not break a caller.
   */
  code?: string
  /** What the caller should do about it, in plain language. */
  fix?: string
  /**
   * Diagnostics for you, not for the caller: a query, an upstream body, an id.
   * Logged in full, never serialized into the response.
   */
  internal?: unknown
  /** Documentation URL for this failure. */
  link?: string
  /** Why the request failed, in plain language. */
  why?: string
}

/**
 * An HTTP error carrying the context that makes a failure actionable.
 *
 * `code`, `why`, `fix`, and `link` appear in both the log and the response.
 * `internal` appears only in the log — it is non-enumerable and excluded from
 * `toJSON()`, so no serializer can leak it into a response body.
 *
 * ```ts
 * throw new HttpError(402, 'Card declined', {
 *   code: 'PAYMENT_DECLINED',
 *   why: 'The issuing bank rejected the charge.',
 *   fix: 'Try a different card, or contact your bank.',
 *   link: 'https://docs.example.com/errors/payment-declined',
 *   internal: { gatewayCode: 'do_not_honor', chargeId }
 * })
 * ```
 *
 * A bare `new HttpError(404, 'Not found')` behaves exactly as before: the
 * response body is the plain message. Only an error that carries at least one
 * client-facing field responds as JSON.
 */
export class HttpError extends Error {
  readonly code?: string
  readonly fix?: string
  /** Log-only diagnostics; see the class doc. */
  declare readonly internal?: unknown
  readonly link?: string
  readonly status: number
  readonly why?: string

  constructor(status: number, message: string, init: HttpErrorInit = {}) {
    super(message)
    this.status = status
    this.code = init.code
    this.fix = init.fix
    this.link = init.link
    this.why = init.why

    // Set explicitly — a native subclass otherwise reports the generic
    // "Error", and the constructor-name fallback breaks under minification.
    // Non-enumerable to match `Error.prototype.name`.
    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: 'HttpError',
      writable: true
    })

    // Non-enumerable so `JSON.stringify`, spreads, and framework serializers
    // that walk own keys cannot pick it up. Property access still works, which
    // is all the log pipeline needs.
    Object.defineProperty(this, 'internal', {
      configurable: true,
      enumerable: false,
      value: init.internal,
      writable: false
    })

    // Elysia renders a thrown error with `toResponse()` when it has one, and
    // falls back to the plain message otherwise. Defining it only when there
    // is something structured to say keeps plain errors byte-identical to
    // their pre-`HttpErrorInit` behaviour.
    const hasClientFields =
      init.code !== undefined ||
      init.why !== undefined ||
      init.fix !== undefined ||
      init.link !== undefined

    if (hasClientFields) {
      Object.defineProperty(this, 'toResponse', {
        configurable: true,
        enumerable: false,
        value: (): Response => {
          // Use the original status only when it's within 200-599 and permits a body.
          // Fall back to 500 for invalid statuses (0, 600, etc.) or body-disallowed codes (204, 304, etc.)
          const safeStatus =
            this.status >= 200 &&
            this.status < 600 &&
            this.status !== 204 &&
            this.status !== 304
              ? this.status
              : 500
          return Response.json(this.toJSON(), { status: safeStatus })
        },
        writable: true
      })
    }
  }

  /**
   * The client-safe payload. `internal` is never part of it; unset fields are
   * `undefined` and so are dropped by `JSON.stringify`.
   */
  toJSON(): HttpErrorPayload {
    return {
      code: this.code,
      fix: this.fix,
      link: this.link,
      message: this.message,
      status: this.status,
      why: this.why
    }
  }
}
