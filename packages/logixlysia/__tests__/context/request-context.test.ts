import { describe, expect, test } from 'bun:test'

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

    // Same reference as the internally stored bag: mutations made via mergeContext
    // are visible through the reference obtained earlier from peekContext.
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
})
