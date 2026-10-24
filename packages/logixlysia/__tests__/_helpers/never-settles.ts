export const neverSettles = (): Promise<void> => {
  const { promise }: PromiseWithResolvers<void> = Promise.withResolvers()
  return promise
}
