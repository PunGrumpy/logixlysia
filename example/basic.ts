import { Elysia } from 'elysia'
import { logger } from '~/index'

const app = new Elysia({
  name: 'Basic Example'
})
  .use(logger())
  .get('/', () => {
    return {
      message: 'Basic Example'
    }
  })
  .listen(3000)

console.log(
  `🧪 Listening on http://${app.server!.hostname}:${app.server!.port}`
)
