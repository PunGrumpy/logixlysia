import { Elysia } from 'elysia'

import { createLogger } from './core'
import { startServer } from './plugins'
import { HttpError, Options, Server } from './types'

export default function logixlysia(options?: Options): Elysia {
  const log = createLogger(options)

  return new Elysia({
    name: 'Logixlysia'
  })
    .onStart(ctx => {
        const showStartupMessage = options?.config?.showStartupMessage ?? true
        if (showStartupMessage) startServer(ctx.server as Server, options)}
    )
    .onRequest(ctx => {
      ctx.store = { beforeTime: process.hrtime.bigint() }
    })
    .onAfterHandle({ as: 'global' }, ({ request, store }) => {
      log.log('INFO', request, { status: 200 }, store as { beforeTime: bigint })
    })
    .onError({ as: 'global' }, ({ request, error, store }) => {
      log.handleHttpError(
        request,
        error as HttpError,
        store as { beforeTime: bigint }
      )
    })
}

export { createLogger, handleHttpError } from './core'
export { logToTransports } from './transports'

