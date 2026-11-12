/**
 * On a request's logger: returns true once the request's final line is
 * written, so merged context can no longer reach it.
 * A global symbol, since `logixlysia/ai` and the root are separate bundles.
 */
export const LINE_SETTLED = Symbol.for('logixlysia.lineSettled')
