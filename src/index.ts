import Elysia from 'elysia'
import * as pc from 'picocolors'
import process from 'process'
import { durationString } from './utils/duration'
import { methodString } from './utils/method'

const logRequest = (
  request: {
    headers: { get: (key: string) => any }
    method: string
    url: string
  },
  store: {
    beforeTime: bigint
  }
) => {
  const logStr = []

  if (request.headers.get('X-Forwarded-For')) {
    logStr.push(`[${pc.cyan(request.headers.get('X-Forwarded-For'))}]`)
  }

  logStr.push(methodString(request.method))
  logStr.push(new URL(request.url).pathname)
  logStr.push(durationString(store.beforeTime))

  console.log(logStr.join(' '))
}

const logError = (
  request: {
    headers: { get: (key: string) => any }
    method: string
    url: string
  },
  error: {
    status?: number
    message?: string
  },
  store: {
    beforeTime: bigint
  }
) => {
  const logStr = []

  logStr.push(pc.red(methodString(request.method)))
  logStr.push(new URL(request.url).pathname)
  logStr.push(pc.red('Error'))

  if (error.status !== undefined) {
    logStr.push(String(error.status))
  }

  if (error.message !== undefined) {
    logStr.push(error.message)
  }

  logStr.push(durationString(store.beforeTime))

  console.log(logStr.join(' '))
}

export const logger = () =>
  new Elysia({
    name: 'logixlysia'
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
      logRequest(request, store as { beforeTime: bigint })
    })
    .onError(({ request, error, store }) => {
      logError(request, error, store as { beforeTime: bigint })
    })
