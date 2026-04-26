import { describe, expect, test } from 'bun:test'
import { HttpError } from '../../src/interfaces'
import { redact, redactRequest, redactString } from '../../src/utils/redact'

describe('redactString', () => {
  test('redacts emails', () => {
    expect(redactString('My email is test@example.com')).toBe(
      'My email is [REDACTED]'
    )
    expect(redactString('test@example.com')).toBe('[REDACTED]')
  })

  test('redacts IPs', () => {
    expect(redactString('IP is 192.168.1.1')).toBe('IP is [REDACTED]')
  })

  test('redacts credit cards', () => {
    expect(redactString('Card: 1234-5678-9012-3456')).toBe('Card: [REDACTED]')
  })

  test('redacts JWTs', () => {
    expect(
      redactString(
        'Token: eyJhbGciOiJIUzI1NiIsInR5cCI.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      )
    ).toBe('Token: [REDACTED]')
  })
})

describe('redact', () => {
  test('redacts deeply nested objects', () => {
    const original = {
      user: {
        email: 'test@example.com',
        ip: '10.0.0.1'
      },
      message: 'Hello'
    }
    const result = redact(original)

    expect(result).toEqual({
      user: {
        email: '[REDACTED]',
        ip: '[REDACTED]'
      },
      message: 'Hello'
    })

    // Original should not be mutated
    expect(original.user.email).toBe('test@example.com')
  })

  test('handles arrays', () => {
    const arr = ['test@example.com', 123]
    const result = redact(arr)
    expect(result).toEqual(['[REDACTED]', 123])
  })

  test('handles Error objects', () => {
    const err = new Error('Failed for test@example.com')
    const result = redact(err) as Error
    expect(result.message).toBe('Failed for [REDACTED]')
  })

  test('preserves HttpError subclass and status', () => {
    const err = new HttpError(404, 'Not found: test@example.com')
    const result = redact(err)
    expect(result).toBeInstanceOf(HttpError)
    expect((result as HttpError).status).toBe(404)
    expect(result.message).toBe('Not found: [REDACTED]')
  })

  test('preserves custom Error subclasses', () => {
    class CustomErr extends Error {
      readonly code: string
      constructor(message: string, code: string) {
        super(message)
        this.code = code
      }
    }
    const err = new CustomErr('x@test.com', 'E1')
    const result = redact(err)
    expect(result).toBeInstanceOf(CustomErr)
    expect((result as CustomErr).code).toBe('E1')
    expect(result.message).toBe('[REDACTED]')
  })

  test('replaces circular object references without stack overflow', () => {
    const root: Record<string, unknown> = { id: 1 }
    root.self = root
    const result = redact(root) as Record<string, unknown>
    expect(result.id).toBe(1)
    expect(result.self).toBe('[Circular]')
  })

  test('replaces circular array references', () => {
    const arr: unknown[] = []
    arr.push(arr)
    const result = redact(arr) as unknown[]
    expect(result[0]).toBe('[Circular]')
  })

  test('redacts Error with circular custom property', () => {
    const err = new Error('e@test.com')
    const errRecord = err as Error & Record<string, unknown>
    errRecord.loop = err
    const result = redact(err) as Error & Record<string, unknown>
    expect(result.message).toBe('[REDACTED]')
    expect(result.loop).toBe('[Circular]')
  })

  test('redacts shared non-cyclic references twice (DAG)', () => {
    const shared = { email: 'shared@example.com' }
    const root = { a: shared, b: shared }
    const result = redact(root) as {
      a: { email: string }
      b: { email: string }
    }
    expect(result.a.email).toBe('[REDACTED]')
    expect(result.b.email).toBe('[REDACTED]')
    expect(result.a).not.toBe(result.b)
  })
})

const sampleJwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('redactRequest', () => {
  test('redacts JWT in URL and returns new Request when changed', () => {
    const url = `http://localhost/api?token=${sampleJwt}`
    const req = new Request(url)
    const out = redactRequest(req)
    expect(out).not.toBe(req)
    expect(out.url).toContain('[REDACTED]')
    expect(out.url).not.toContain(sampleJwt)
  })

  test('redacts sensitive header values', () => {
    const req = new Request('http://localhost/', {
      headers: { authorization: `Bearer ${sampleJwt}` }
    })
    const out = redactRequest(req)
    expect(out.headers.get('authorization')).toBe('Bearer [REDACTED]')
  })

  test('returns same request when nothing would change', () => {
    const req = new Request('http://localhost/plain')
    expect(redactRequest(req)).toBe(req)
  })
})
