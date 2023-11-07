import Elysia from 'elysia'
import { formatLogger } from './logger'
import { startString } from './utils/start'
import { Server } from 'bun'

export const logger = () => {
  const log = formatLogger()

  const elysia = new Elysia({
    name: 'Logixlysia'
  })
    .onStart(ctx => {
      startString(ctx.app.server as Server)
    })
    .onRequest(ctx => {
      ctx.store = { beforeTime: process.hrtime.bigint() } as {
        beforeTime: bigint
      }
    })
    .onBeforeHandle(ctx => {
      ctx.store = { beforeTime: process.hrtime.bigint() } as {
        beforeTime: bigint
      }
    })
    .onAfterHandle(({ request, store }) => {
      log.info(request, {}, store as { beforeTime: bigint })
    })
    .onError(({ request, error, store }) => {
      log.error(request, error, store as { beforeTime: bigint })
    })

  return elysia
}
