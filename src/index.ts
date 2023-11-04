import Elysia from 'elysia'
import * as pc from 'picocolors'
import process from 'process'
import { durationString } from './utils/duration'
import { methodString } from './utils/method'

export const logger = () =>
  new Elysia({
    name: '@grotto/logysia'
  })
    .onRequest(ctx => {
      ctx.store = { ...ctx.store, beforeTime: process.hrtime.bigint() }
    })
    .onBeforeHandle(ctx => {
      ctx.store = { ...ctx.store, beforeTime: process.hrtime.bigint() }
    })
    .onAfterHandle(({ request, store }) => {
      const logStr: string[] = []
      if (request.headers.get('X-Forwarded-For')) {
        logStr.push(`[${pc.cyan(request.headers.get('X-Forwarded-For'))}]`)
      }

      logStr.push(methodString(request.method))

      logStr.push(new URL(request.url).pathname)
      const beforeTime: bigint = (store as any).beforeTime

      logStr.push(durationString(beforeTime))

      console.log(logStr.join(' '))
    })
    .onError(({ request, error, store }) => {
      const logStr: string[] = []

      logStr.push(pc.red(methodString(request.method)))

      logStr.push(new URL(request.url).pathname)

      logStr.push(pc.red('Error'))

      if ('status' in error) {
        logStr.push(String(error.status))
      }

      logStr.push(error.message)
      const beforeTime: bigint = (store as any).beforeTime

      logStr.push(durationString(beforeTime))

      console.log(logStr.join(' '))
    })
