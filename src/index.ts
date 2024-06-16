import { Server } from 'bun'
import Elysia from 'elysia'

import { createLogger, handleHttpError } from './logger'
import { HttpError, Options } from './types'
import startServer from './utils/start'

/**
 * Creates a logger plugin for ElysiaJS.
 *
 * @export
 * @module logger
 * @category Logger
 * @subcategory Functions
 *
 * @name Logixlysia
 * @description Logixlysia is a logger plugin for ElysiaJS.
 * @param {Options} [options] Configuration options for the logger.
 *
 * @returns {Elysia} The logger plugin for ElysiaJS.
 */
export default function logixlysia(options?: Options): Elysia {
  const log = createLogger(options)

  return new Elysia({
    name: 'Logixlysia'
  })
    .onStart(ctx => startServer(ctx.server as Server))
    .onRequest(ctx => {
      ctx.store = { beforeTime: process.hrtime.bigint() }
    })
    .onAfterHandle({ as: 'global' }, ({ request, store }) => {
      log.log('INFO', request, { status: 200 }, store as { beforeTime: bigint })
    })
    .onError({ as: 'global' }, ({ request, error, store }) => {
      handleHttpError(
        request,
        error as HttpError,
        store as { beforeTime: bigint },
        options
      )
    })
}
