export const sleep = (ms: number): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  setTimeout(resolve, ms)
  return promise
}
