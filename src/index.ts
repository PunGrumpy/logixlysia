import Elysia from 'elysia'
import { createLogger, handleHttpError } from './logger'
import startString from './utils/start'
import { Server } from 'bun'
import { Options } from './types'

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
  const log = createLogger(options)

  const elysia = new Elysia({
    name: 'Logixlysia'
  })
    .onStart(ctx => {
      startString(ctx.server as Server)
    })
    .onRequest(ctx => {
      ctx.store = { beforeTime: process.hrtime.bigint() }
    })
    .onAfterHandle({ as: 'global' }, ({ request, store }) => {
      const logStr: string[] = []

      if (options?.ip) {
        const forwardedFor = request.headers.get('x-forwarded-for')
        if (forwardedFor) {
          logStr.push(`IP: ${forwardedFor}`)
        }
      }

      log.log(
        'INFO',
        request,
        {
          message: logStr.join(' ')
        },
        store as { beforeTime: bigint }
      )
    })
    .onError({ as: 'global' }, ({ request, error, store }) => {
      handleHttpError(request, error, store as { beforeTime: bigint })
    })

  return elysia
}
