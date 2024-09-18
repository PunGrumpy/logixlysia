import { expect, test } from 'bun:test'

import logixlysia from '../src/index'

test('logixlysia', () => {
  const elysia = logixlysia()
  expect(elysia).toBeDefined()
})
