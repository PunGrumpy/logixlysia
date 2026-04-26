import { describe, expect, test } from 'bun:test'
import { redact, redactString } from '../../src/utils/redact'

describe('redactString', () => {
  test('redacts emails', () => {
    expect(redactString('My email is test@example.com')).toBe('My email is [REDACTED]')
    expect(redactString('test@example.com')).toBe('[REDACTED]')
  })

  test('redacts IPs', () => {
    expect(redactString('IP is 192.168.1.1')).toBe('IP is [REDACTED]')
  })

  test('redacts credit cards', () => {
    expect(redactString('Card: 1234-5678-9012-3456')).toBe('Card: [REDACTED]')
  })

  test('redacts JWTs', () => {
    expect(redactString('Token: eyJhbGciOiJIUzI1NiIsInR5cCI.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')).toBe('Token: [REDACTED]')
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
})
