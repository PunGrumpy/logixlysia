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

    expect(store.getContext(request)).toEqual({ userId: 'u1', plan: 'pro' })
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
      { status: 200, context: { userId: 'override' } },
      { userId: 'accumulated', plan: 'pro' }
    )

    expect(merged.context).toEqual({ userId: 'override', plan: 'pro' })
  })
})
