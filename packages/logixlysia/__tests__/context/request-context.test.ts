import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import {
  createRequestContextStore,
  mergeLogDataContext
} from '../../src/context/request-context'

describe('request context store', () => {
  test('mergeContext accumulates fields per request', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(request, { userId: 'u1' })
    store.mergeContext(request, { plan: 'pro' })

    expect(store.getContext(request)).toEqual({ plan: 'pro', userId: 'u1' })
  })

  test('mergeContext keeps an own __proto__ key as a key', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(
      request,
      JSON.parse('{"__proto__":{"isAdmin":true},"plan":"pro"}')
    )
    const ctx = store.getContext(request)

    expect(ctx.plan).toBe('pro')
    expect('isAdmin' in ctx).toBe(false)
    expect(Object.hasOwn(ctx, '__proto__')).toBe(true)
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  test('clearContext removes accumulated fields', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(request, { userId: 'u1' })
    store.clearContext(request)

    expect(store.getContext(request)).toEqual({})
  })

  test('mergeLogDataContext prefers explicit context over accumulated', () => {
    const merged = mergeLogDataContext(
      { context: { userId: 'override' }, status: 200 },
      { plan: 'pro', userId: 'accumulated' }
    )

    expect(merged.context).toEqual({ plan: 'pro', userId: 'override' })
  })

  test('peekContext returns the live bag without cloning', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(request, { userId: 'u1' })
    const peeked = store.peekContext(request)
    store.mergeContext(request, { plan: 'pro' })

    expect(peeked).toEqual({ plan: 'pro', userId: 'u1' })
  })

  test('peekContext returns a shared empty object for unknown keys', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    expect(store.peekContext(request)).toEqual({})
  })

  test('getContext still returns a fresh copy each call, unlike peekContext', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')
    store.mergeContext(request, { userId: 'u1' })

    const first = store.getContext(request)
    const second = store.getContext(request)

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
  })

  test('two nested merges produce the union of their keys', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(request, { user: { id: 'u1' } })
    store.mergeContext(request, { user: { plan: 'pro' } })

    expect(store.getContext(request)).toEqual({
      user: { id: 'u1', plan: 'pro' }
    })
  })

  test('nested merges reach three levels deep', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(request, { a: { b: { c: 1 } } })
    store.mergeContext(request, { a: { b: { d: 2 }, e: 3 } })

    expect(store.getContext(request)).toEqual({
      a: { b: { c: 1, d: 2 }, e: 3 }
    })
  })

  test('a later nested value wins over an earlier one at the same key', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(request, { user: { plan: 'free' } })
    store.mergeContext(request, { user: { plan: 'pro' } })

    expect(store.getContext(request)).toEqual({ user: { plan: 'pro' } })
  })

  test('merging does not mutate the objects the caller passed in', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')
    const first = { user: { id: 'u1' } }
    const second = { user: { plan: 'pro' } }

    store.mergeContext(request, first)
    store.mergeContext(request, second)

    expect(first).toEqual({ user: { id: 'u1' } })
    expect(second).toEqual({ user: { plan: 'pro' } })
  })

  test('a merge leaves earlier peeked nested objects untouched', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(request, { user: { id: 'u1' } })
    const before = store.peekContext(request).user
    store.mergeContext(request, { user: { plan: 'pro' } })

    expect(before).toEqual({ id: 'u1' })
  })

  test('null-prototype objects merge like plain objects', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')
    const bare = Object.assign(Object.create(null), { id: 'u1' })

    store.mergeContext(request, { user: bare })
    store.mergeContext(request, { user: { plan: 'pro' } })

    expect(store.getContext(request)).toEqual({
      user: { id: 'u1', plan: 'pro' }
    })
  })

  test('arrays, dates, class instances, null and primitives replace', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')
    class Tag {
      readonly name: string
      constructor(name: string) {
        this.name = name
      }
    }
    const when = new Date(0)
    const tag = new Tag('b')

    store.mergeContext(request, {
      at: new Date(1),
      cleared: { keep: 'no' },
      count: 1,
      label: new Tag('a'),
      tags: ['a', 'b']
    })
    store.mergeContext(request, {
      at: when,
      cleared: null,
      count: { now: 'object' },
      label: tag,
      tags: ['c']
    })

    const ctx = store.getContext(request)
    expect(ctx.tags).toEqual(['c'])
    expect(ctx.at).toBe(when)
    expect(ctx.label).toBe(tag)
    expect(ctx.cleared).toBeNull()
    expect(ctx.count).toEqual({ now: 'object' })
  })

  test('a nested __proto__ key stays an own property and pollutes nothing', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(request, { user: { id: 'u1' } })
    store.mergeContext(
      request,
      JSON.parse('{"user":{"__proto__":{"polluted":true},"plan":"pro"}}')
    )
    store.mergeContext(request, JSON.parse('{"__proto__":{"polluted":true}}'))
    const user = store.getContext(request).user as Record<string, unknown>

    expect(user.id).toBe('u1')
    expect(user.plan).toBe('pro')
    expect(Object.hasOwn(user, '__proto__')).toBe(true)
    expect(user.polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('a nested constructor key does not resolve to the inherited function', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')

    store.mergeContext(request, { constructor: { a: 1 } })
    store.mergeContext(request, { other: { constructor: { b: 2 } } })

    const ctx = store.getContext(request)
    expect(Object.getOwnPropertyDescriptor(ctx, 'constructor')?.value).toEqual({
      a: 1
    })
    expect(ctx.other).toEqual({ constructor: { b: 2 } })
  })

  test('cyclic input is capped by depth and never throws', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')
    const cyclic: Record<string, unknown> = { id: 'a' }
    cyclic.self = cyclic

    expect(() => {
      store.mergeContext(request, { node: cyclic })
      store.mergeContext(request, { node: cyclic })
    }).not.toThrow()
    expect((store.getContext(request).node as { id: string }).id).toBe('a')
  })

  test('mergeLogDataContext merges a per-line nested field over the accumulated one', () => {
    const accumulated = Object.freeze({ user: Object.freeze({ id: 'u1' }) })

    const merged = mergeLogDataContext(
      { context: { user: { seat: 2 } }, status: 200 },
      accumulated
    )

    expect(merged.context).toEqual({ user: { id: 'u1', seat: 2 } })
    expect(accumulated).toEqual({ user: { id: 'u1' } })
  })

  test('mergeLogDataContext leaves the store unchanged', () => {
    const store = createRequestContextStore()
    const request = new Request('http://localhost/')
    store.mergeContext(request, { user: { id: 'u1' } })

    mergeLogDataContext(
      { context: { user: { seat: 2 } } },
      store.peekContext(request)
    )

    expect(store.getContext(request)).toEqual({ user: { id: 'u1' } })
  })

  test('a handler sees mergeContext calls and per-line context combined', async () => {
    const contexts: Record<string, unknown>[] = []
    const transport = mock(
      (_level: string, _message: string, meta?: Record<string, unknown>) => {
        if (meta?.context && typeof meta.context === 'object') {
          contexts.push(meta.context as Record<string, unknown>)
        }
      }
    )
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
      .get('/user', ({ log }) => {
        log.mergeContext({ user: { id: 'u1' } })
        log.mergeContext({ user: { plan: 'pro' } })
        log.info('seated', { user: { seat: 2 } })
        return 'ok'
      })

    await app.handle(new Request('http://localhost/user'))

    expect(contexts[0]?.user).toEqual({ id: 'u1', plan: 'pro', seat: 2 })
  })
})
