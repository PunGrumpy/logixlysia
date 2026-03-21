import { describe, expectTypeOf, test } from 'bun:test'
import { Elysia } from 'elysia'

import { logixlysia } from '../../src'

describe('logixlysia WebSocket typing (#220)', () => {
  test('preserves parent store keys on ws.data after .use(logixlysia())', () => {
    new Elysia()
      .state('marker', 42 as const)
      .use(logixlysia())
      .ws('/', {
        open(ws) {
          expectTypeOf(ws.data.store.marker).toEqualTypeOf<42>()
          expectTypeOf(ws.data.store.logger).toHaveProperty('log')
          expectTypeOf(ws.data.store.pino).not.toBeUndefined()
        }
      })
  })
})
