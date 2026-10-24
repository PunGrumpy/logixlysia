const POLL_INTERVAL_MS = 10
const POLL_TIMEOUT_MS = 1000

/**
 * Polls until `predicate` holds or a second passes, and resolves either way so
 * the assertions that follow report what went wrong.
 */
export const waitFor = (predicate: () => boolean): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  const deadline = Date.now() + POLL_TIMEOUT_MS
  const timer = setInterval(() => {
    if (predicate() || Date.now() >= deadline) {
      clearInterval(timer)
      resolve()
    }
  }, POLL_INTERVAL_MS)
  return promise
}
