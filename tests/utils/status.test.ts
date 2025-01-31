import { expect, test } from 'bun:test'
import { Elysia } from 'elysia'

import logixlysia from '../../src/index'

test('handles numeric status codes', async () => {
  const app = new Elysia().use(logixlysia()).get('/rate-limited', ({ set }) => {
    set.status = 429
    return 'Rate Limited'
  })

  const res = await app.handle(new Request('http://localhost/rate-limited'))
  expect(res.status).toBe(429)
})

test('handles string status codes', async () => {
  const app = new Elysia().use(logixlysia()).get('/not-found', ({ set }) => {
    set.status = 'Not Found'
    return 'Resource not found'
  })

  const res = await app.handle(new Request('http://localhost/not-found'))
  expect(res.status).toBe(404)
})

test('handles custom error status', async () => {
  const app = new Elysia().use(logixlysia()).get('/error', ({ set }) => {
    set.status = 418
    const error = new Error('Custom error')
    throw error
  })

  const res = await app.handle(new Request('http://localhost/error'))
  expect(res.status).toBe(418)
})

test('handles custom error status with message', async () => {
  const app = new Elysia().use(logixlysia()).get('/error', ({ set }) => {
    set.status = "I'm a teapot"
    const error = new Error('Custom error')
    throw error
  })

  const res = await app.handle(new Request('http://localhost/error'))
  expect(res.status).toBe(418)
})
