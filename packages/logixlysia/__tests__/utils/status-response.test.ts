import { describe, expect, test } from 'bun:test'
import { asStatusResponse } from '../../src/helpers/status'

// A stand-in for the class each Elysia line builds for `status()`, matched by
// its constructor name.
const built = (className: string, fields: Record<string, unknown>): object =>
  Object.assign(Object.create({ constructor: { name: className } }), fields)

describe('asStatusResponse', () => {
  test('reads the code and body of an Elysia 1.x status()', () => {
    const value = built('ElysiaCustomStatusResponse', {
      code: 409,
      response: 'conflict'
    })

    expect(asStatusResponse(value)).toEqual({ code: 409, response: 'conflict' })
  })

  test('reads the code and body of an Elysia 2 status()', () => {
    const value = built('ElysiaStatus', { response: 'conflict', status: 409 })

    expect(asStatusResponse(value)).toEqual({ code: 409, response: 'conflict' })
  })

  test('reads an Elysia 2 status() for a code with no body', () => {
    const value = built('ElysiaStatus', { status: 204 })

    expect(asStatusResponse(value)).toEqual({ code: 204, response: undefined })
  })

  test('does not match a plain object with the same keys', () => {
    expect(asStatusResponse({ code: 409, response: 'x' })).toBeUndefined()
    expect(asStatusResponse({ response: 'x', status: 409 })).toBeUndefined()
  })
})
