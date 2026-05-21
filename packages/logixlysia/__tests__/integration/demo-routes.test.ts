import { describe, expect, mock, test } from 'bun:test'
import nodeAdapter from '@elysiajs/node'
import { Elysia } from 'elysia'

import { logixlysia } from '../../src'
import { createDemoApp, silentTestOptions, type TransportLog } from './demo-app'

const mockTransport = () =>
  mock<TransportLog>(() => {
    /* noop */
  })

describe('demo routes (Bun)', () => {
  test('GET / returns 200', async () => {
    const transport = mockTransport()
    const app = createDemoApp(silentTestOptions(transport))
    const response = await app.handle(new Request('http://localhost/'))
    expect(response.status).toBe(200)
    expect(transport).toHaveBeenCalled()
  })

  test('GET /checkout merges context into access log', async () => {
    const transport = mockTransport()
    const app = createDemoApp(silentTestOptions(transport))
    const response = await app.handle(new Request('http://localhost/checkout'))
    expect(response.status).toBe(200)
    expect(transport).toHaveBeenCalledTimes(1)
    const meta = transport.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined
    const context = meta?.context as Record<string, unknown> | undefined
    expect(context?.userId).toBe('usr_test')
    expect(context?.cart).toEqual({ items: 1, total: 100 })
  })

  test('POST /chat merges ai metrics into access log', async () => {
    const transport = mockTransport()
    const app = createDemoApp(silentTestOptions(transport))
    const response = await app.handle(
      new Request('http://localhost/chat', { method: 'POST' })
    )
    expect(response.status).toBe(200)
    expect(transport).toHaveBeenCalledTimes(1)
    const meta = transport.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined
    const context = meta?.context as Record<string, unknown> | undefined
    const ai = context?.ai as Record<string, unknown> | undefined
    expect(ai?.model).toBe('test-model')
    expect(ai?.totalTokens).toBe(15)
  })

  test('GET /trace runs injectTraceContext without error', async () => {
    const transport = mockTransport()
    const app = createDemoApp(silentTestOptions(transport))
    const response = await app.handle(new Request('http://localhost/trace'))
    expect(response.status).toBe(200)
    expect(transport).toHaveBeenCalled()
  })
})

describe('Node adapter', () => {
  test('logixlysia resolves and handles GET / on @elysiajs/node', async () => {
    const transport = mockTransport()
    const app = new Elysia({ adapter: nodeAdapter() })
      .use(logixlysia(silentTestOptions(transport)))
      .get('/', () => ({ ok: true }))

    const response = await app.handle(new Request('http://localhost/'))
    expect(response.status).toBe(200)
    expect(transport).toHaveBeenCalled()
  })
})
