import node from '@elysiajs/node'
import { swagger } from '@elysiajs/swagger'
import { Elysia, env } from 'elysia'
import packageJson from 'logixlysia/package.json' with { type: 'json' }
import { routers } from './routers/index.js'

export const app = new Elysia({
  name: 'Elysia Node (JS) with Logixlysia',
  adapter: node()
})
  .use(
    swagger({
      documentation: {
        info: {
          title: 'Elysia Node (JS) with Logixlysia',
          version: packageJson.version
        }
      },
      scalarConfig: {
        theme: 'saturn'
      }
    })
  )
  .use(routers)

app.listen({ port: env.PORT })
