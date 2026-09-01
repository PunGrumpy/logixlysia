import { describe, expectTypeOf, test } from 'bun:test'
import { Elysia } from 'elysia'
import { websocket } from 'elysia/websocket'

import logixlysia from '../../src'

// Elysia 2 merges the route context into the socket object itself, so the old
// `ws.data.store` reads as `ws.store` — and `.ws()` needs the opt-in
// `elysia/websocket` capability registered somewhere in the app.
describe('logixlysia WebSocket typing (#220)', () => {
  test('infers plugin store on ws when .ws follows .use(logixlysia()) on a bare Elysia', () => {
    new Elysia()
      .use(websocket())
      .use(logixlysia())
      .ws('/', {
        open(ws) {
          expectTypeOf(ws.store.logger).toHaveProperty('log')
          expectTypeOf(ws.store.pino).not.toBeUndefined()
        }
      })
  })

  test('preserves parent store keys on ws after .use(logixlysia())', () => {
    new Elysia()
      .use(websocket())
      .state('marker', 42 as const)
      .use(logixlysia())
      .ws('/', {
        open(ws) {
          expectTypeOf(ws.store.marker).toEqualTypeOf<42>()
          expectTypeOf(ws.store.logger).toHaveProperty('log')
          expectTypeOf(ws.store.pino).not.toBeUndefined()
        }
      })
  })
})
