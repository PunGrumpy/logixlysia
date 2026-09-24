/**
 * Resolves once `promise` settles, whether it resolved or rejected. Use it for
 * work whose failure the caller that started it already reports.
 */
export const settle = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise
  } catch {
    // Reported where the promise came from.
  }
}
