/** Fields an enricher contributes, or nothing when it has nothing to add. */
export type EnricherFields = Record<string, unknown> | undefined

/** What the response phase of an enricher gets to look at. */
export interface EnricherResponseInput {
  /** Elapsed time for the request in milliseconds. */
  durationMs: number
  /** Response headers set so far (Elysia's `set.headers`). */
  headers: Record<string, unknown>
  request: Request
  status: number
}

/**
 * A two-phase context contributor. Whatever it returns is merged into the
 * request context, so the fields reach every sink at once — the console tree,
 * file logs, and every configured transport.
 */
export interface Enricher {
  /** Runs at request start, before the handler. */
  request?: (request: Request) => EnricherFields
  /** Runs once the outcome is known, before the request's final log line. */
  response?: (input: EnricherResponseInput) => EnricherFields
}

/** An {@link Enricher}, or just its request phase as a bare function. */
export type EnricherLike = Enricher | ((request: Request) => EnricherFields)
