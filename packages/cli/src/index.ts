import {
  type DefinitionBase,
  Elysia,
  type EphemeralType,
  type MetadataBase,
  type RouteBase,
  type SingletonBase
} from 'elysia'
import { startServer } from './extensions'
import type { LogixlysiaStore, Options } from './interfaces'
import { createLogger } from './logger'

export const logixlysia = (options: Options = {}) => {
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

  return (
    new Elysia({
      name: 'Logixlysia',
      detail: {
        description:
          'Logixlysia is a plugin for Elysia that provides a logger and pino logger.',
        tags: ['logging', 'pino']
      }
    })
      .state('logger', logger)
      .state('pino', logger.pino)
      .state('beforeTime', BigInt(0))
      .onStart(({ server }) => {
        if (server) {
          startServer(server, options)
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
      .as('scoped')
  )
}

export type {
  Logger,
  LogixlysiaContext,
  LogixlysiaStore,
  LogLevel,
  Options,
  Pino,
  RequestInfo,
  StoreData,
  Transport
} from './interfaces'

export type Logixlysia = Elysia<
  string,
  SingletonBase & {
    store: SingletonBase['store'] & LogixlysiaStore
  },
  DefinitionBase,
  MetadataBase,
  RouteBase,
  EphemeralType,
  EphemeralType
>

export default logixlysia
