import { Elysia } from 'elysia'
import { startServer } from './extensions'
import type { LogixlysiaStore, Options } from './interfaces'
import { createLogger } from './logger'

/**
 * Empty singleton slots must not use `Record<string, never>`: intersecting that with Elysia's `Context`
 * makes every key (including `store`) become `never` because each key is merged with `never`.
 */
export interface EmptyElysiaSlot {
  readonly __logixlysiaEmpty?: never
}

/**
 * Explicit singleton without Elysia's `SingletonBase` `Record<string, unknown>` on decorator/derive/resolve so
 * merged `Context` and WebSocket `ws.data` keep precise keys after `.use(logixlysia())`.
 */
export interface LogixlysiaSingleton {
  decorator: EmptyElysiaSlot
  derive: EmptyElysiaSlot
  resolve: EmptyElysiaSlot
  store: LogixlysiaStore
}

// Elysia's `SingletonBase.store` is `Record<string, unknown>`; `LogixlysiaStore` is intentionally closed (see #220).
// @ts-expect-error — closed store is correct at runtime and for merged `ws.data` inference.
export type Logixlysia = Elysia<'', LogixlysiaSingleton>

export const logixlysia = (options: Options = {}): Logixlysia => {
  const didCustomLog = new WeakSet<Request>()
  const baseLogger = createLogger(options)
  const logger = {
    ...baseLogger,
    debug: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request)
      baseLogger.debug(request, message, context)
    },
    info: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request)
      baseLogger.info(request, message, context)
    },
    warn: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request)
      baseLogger.warn(request, message, context)
    },
    error: (
      request: Request,
      message: string,
      context?: Record<string, unknown>
    ) => {
      didCustomLog.add(request)
      baseLogger.error(request, message, context)
    }
  }

  const app = new Elysia({
    name: 'Logixlysia',
    detail: {
      description:
        'Logixlysia is a plugin for Elysia that provides a logger and pino logger.',
      tags: ['logging', 'pino']
    }
  })

  return (
    app
      .state('logger', logger)
      .state('pino', logger.pino)
      .state('beforeTime', BigInt(0))
      .onStart(({ server }): void => {
        if (server) {
          startServer(server, options)
        } else {
          // Node adapter fallback
          const port = Number(process.env.PORT) || 3000
          const hostname = process.env.HOST || 'localhost'
          startServer({ port, hostname, protocol: 'http' }, options)
        }
      })
      .onRequest(({ store }) => {
        store.beforeTime = process.hrtime.bigint()
      })
      .onAfterHandle(({ request, set, store }) => {
        if (didCustomLog.has(request)) {
          return
        }

        const status = typeof set.status === 'number' ? set.status : 200
        let level: 'INFO' | 'WARNING' | 'ERROR' = 'INFO'
        if (status >= 500) {
          level = 'ERROR'
        } else if (status >= 400) {
          level = 'WARNING'
        }

        logger.log(level, request, { status }, store)
      })
      .onError(({ request, error, store }) => {
        logger.handleHttpError(request, error, store)
      })
      // Ensure plugin lifecycle hooks (onRequest/onAfterHandle/onError) apply to the parent app.
      .as('scoped') as Logixlysia
  )
}

export type {
  Logger,
  LogixlysiaContext,
  LogixlysiaStore,
  LogLevel,
  Options,
  Pino,
  StoreData,
  Transport
} from './interfaces'

export default logixlysia
