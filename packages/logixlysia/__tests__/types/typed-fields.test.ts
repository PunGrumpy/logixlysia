import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import logixlysia, { useLogger } from '../../src'

/**
 * These assertions are checked by `tsc --noEmit` as much as by the runtime:
 * every `@ts-expect-error` below fails the typecheck if the field typing stops
 * rejecting what it should.
 */
interface CheckoutFields {
  cartId: string
  itemCount: number
  userId: string
}

const captureTransport = () => {
  const contexts: Record<string, unknown>[] = []
  const transport = mock(
    (_level: string, _message: string, meta?: Record<string, unknown>) => {
      const context = meta?.context
      if (context && typeof context === 'object') {
        contexts.push(context as Record<string, unknown>)
      }
    }
  )
  return { contexts, transport }
}

describe('typed request fields', () => {
  test('accepts declared fields and records them', async () => {
    const { contexts, transport } = captureTransport()

    const app = new Elysia()
      .use(
        logixlysia<CheckoutFields>({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .post('/pay', ({ log }) => {
        log.mergeContext({ cartId: 'cart_1', userId: 'user_1' })
        log.info('charged', { itemCount: 3 })
        return 'ok'
      })

    await app.handle(new Request('http://localhost/pay', { method: 'POST' }))

    expect(contexts[0]).toMatchObject({
      cartId: 'cart_1',
      itemCount: 3,
      userId: 'user_1'
    })
  })

  test('rejects misspelled and undeclared fields at compile time', () => {
    const app = new Elysia()
      .use(
        logixlysia<CheckoutFields>({
          config: { disableFileLogging: true, disableInternalLogger: true }
        })
      )
      .get('/typos', ({ log }) => {
        // @ts-expect-error — snake_case variant of a camelCase field
        log.mergeContext({ user_id: 'user_1' })
        // @ts-expect-error — field is not part of CheckoutFields
        log.mergeContext({ unrelated: true })
        // @ts-expect-error — itemCount is a number
        log.mergeContext({ itemCount: 'three' })
        // @ts-expect-error — the same check applies to per-call context
        log.info('charged', { userid: 'user_1' })
        return 'ok'
      })

    expect(app).toBeDefined()
  })

  test('useLogger carries the same field type', () => {
    const log = useLogger<CheckoutFields>()

    log.mergeContext({ userId: 'user_1' })
    // @ts-expect-error — not part of CheckoutFields
    log.mergeContext({ userId2: 'user_1' })

    expect(typeof log.info).toBe('function')
  })

  test('untyped usage still accepts any field', async () => {
    const { contexts, transport } = captureTransport()

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/anything', ({ log }) => {
        log.mergeContext({ whatever: 1 })
        log.info('done', { alsoFine: true })
        return 'ok'
      })

    await app.handle(new Request('http://localhost/anything'))

    expect(contexts[0]).toMatchObject({ alsoFine: true, whatever: 1 })
  })
})
