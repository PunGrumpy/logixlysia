/**
 * On the plugin's logger: returns a request's own logger, the object a
 * handler gets as `log`, so code that holds `store.logger` and the request
 * addresses the same thing. A global symbol, for the same reason as
 * `LINE_SETTLED`.
 */
export const REQUEST_LOGGER = Symbol.for('logixlysia.requestLogger')
