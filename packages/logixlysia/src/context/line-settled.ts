/**
 * On a request's logger: returns true once merged context can no longer reach
 * the request's line, because it was written or a custom line replaced it.
 * A global symbol, since `logixlysia/ai` and the root are separate bundles.
 */
export const LINE_SETTLED = Symbol.for('logixlysia.lineSettled')
