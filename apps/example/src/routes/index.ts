import type { Logixlysia } from 'logixlysia'
import { boomRoute } from './boom'
import { customRoute } from './custom'
import { pinoRoute } from './pino'
import { statusRoute } from './status'

export const routes = <App extends Logixlysia>(app: App) =>
  app.use(customRoute).use(pinoRoute).use(statusRoute).use(boomRoute)
