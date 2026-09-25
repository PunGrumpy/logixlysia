/** `new Promise(resolve => setTimeout(resolve, ms))`, as a macrotask wait. */
export const sleep = (ms: number): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  setTimeout(resolve, ms)
  return promise
}
