import { Elysia } from 'elysia'

import { startServer } from './extensions'
import { getStatusCode } from './helpers/status'
import type { HttpError, Options, Server } from './interfaces'
import { createLogger } from './logger'

export default function logixlysia(options?: Options): Elysia {
	const log = createLogger(options)

	return new Elysia({
		name: 'Logixlysia'
	})
		.onStart(ctx => {
			const showStartupMessage = options?.config?.showStartupMessage ?? true
			if (showStartupMessage) startServer(ctx.server as Server, options)
		})
		.onRequest(ctx => {
			ctx.store = { beforeTime: process.hrtime.bigint() }
		})
		.onAfterHandle({ as: 'global' }, ({ request, set, store }) => {
			const status = getStatusCode(set.status || 200)
			log.log(
				'INFO',
				request,
				{
					status,
					message: String(set.headers?.['x-message'] || '')
				},
				store as { beforeTime: bigint }
			)
		})
		.onError({ as: 'global' }, ({ request, error, set, store }) => {
			const status = getStatusCode(set.status || 500)
			log.handleHttpError(
				request,
				{ ...error, status } as HttpError,
				store as { beforeTime: bigint }
			)
		})
}

export { createLogger, handleHttpError } from './logger'
export { logToTransports } from './output'
