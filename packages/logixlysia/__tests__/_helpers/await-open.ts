export const awaitOpen = (socket: WebSocket): Promise<void> => {
  const {
    promise: opened,
    reject: onOpenFailure,
    resolve: onOpen
  }: PromiseWithResolvers<void> = Promise.withResolvers()
  socket.addEventListener('open', () => onOpen())
  socket.addEventListener('error', () =>
    onOpenFailure(new Error('WebSocket connection failed'))
  )
  socket.addEventListener('close', () =>
    onOpenFailure(new Error('WebSocket closed before opening'))
  )
  return opened
}
