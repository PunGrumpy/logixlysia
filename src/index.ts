import Elysia from 'elysia'
import { createLogger } from './logger'
import startString from './utils/start'
import { Server } from 'bun'
import { Options } from './options'

/**
 * Creates a logger.
 *
 * @export
 * @module logger
 * @category Logger
 * @subcategory Functions
 *
 * @name Logixlysia
 * @description Logixlysia is a logger plugin for ElysiaJS.
 * @author PunGrumpy
 * @license MIT
 *
 * @returns {Elysia} The logger.
 */
export const logger = (options?: Options): Elysia => {
  const log = createLogger()

  const elysia = new Elysia({
    name: 'Logixlysia'
  })
    .onStart(ctx => {
      startString(ctx.server as Server)
    })
    .onRequest(ctx => {
      ctx.store = { beforeTime: process.hrtime.bigint() }
    })
    .onBeforeHandle({ as: 'global' }, ({ request, store }) => {
      log.log('INFO', request, {}, store as { beforeTime: bigint })
    })
    .onAfterHandle({ as: 'global' }, ({ request, store }) => {
      if (options?.ip !== undefined && options.ip) {
        if (request.headers.get('x-forwarded-for')) {
          log.log(
            'INFO',
            request,
            {
              message: `IP: ${request.headers.get('x-forwarded-for')}`
            },
            store as { beforeTime: bigint }
          )
        }
      }
    })
    .onError(({ request, error, store }) => {
      log.log('ERROR', request, error, store as { beforeTime: bigint })
    })

  return elysia
}
