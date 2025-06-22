import { Elysia } from 'elysia'
import logixlysia, { type LogixlysiaContext } from '../src'

const app = new Elysia({
  name: 'Logixlysia Example'
}).use(logixlysia())

app.get('/', () => 'Hello Elysia')
app.get('/custom', ({ store, request }: LogixlysiaContext) => {
  const { logger } = store
  logger.info(request, 'Custom log message', {
    custom: 'value',
    another: 'value2'
  })
  return 'Custom log message'
})

app.listen(3000)
