import { openapi } from '@elysia/openapi'
import { Elysia, env } from 'elysia'
import packageJson from 'logixlysia/package.json'
import { routers } from './routers'

export const app = new Elysia({
  name: 'Elysia with Logixlysia'
})
  .use(
    openapi({
      documentation: {
        info: {
          title: 'Elysia with Logixlysia',
          version: packageJson.version
        }
      },
      scalar: {
        theme: 'saturn'
      }
    })
  )
  .use(routers)

app.listen({
  port: env.PORT
})
