import { describe, expect, test } from 'bun:test'
import { HttpError } from '../../src/interfaces'
import {
  buildPinoRedactPaths,
  isSensitiveKey,
  redact,
  redactRequest,
  redactString
} from '../../src/utils/redact'

describe('redactString', () => {
  test('redacts emails', () => {
    expect(redactString('My email is test@example.com')).toBe(
      'My email is [REDACTED]'
    )
    expect(redactString('test@example.com')).toBe('[REDACTED]')
  })

  test('redacts email in long percent run without hanging', () => {
    const input = `${'%'.repeat(50_000)}@example.com`
    const start = performance.now()
    const result = redactString(input)
    expect(performance.now() - start).toBeLessThan(500)
    expect(result.endsWith('[REDACTED]')).toBe(true)
  })

  test('redacts IPs', () => {
    expect(redactString('IP is 192.168.1.1')).toBe('IP is [REDACTED]')
  })

  test('redacts Luhn-valid PANs only', () => {
    expect(redactString('Card: 4111 1111 1111 1111')).toBe('Card: [REDACTED]')
    expect(redactString('Card: 1234-5678-9012-3456')).toBe(
      'Card: 1234-5678-9012-3456'
    )
  })

  test('does not redact millisecond timestamps as card numbers', () => {
    expect(redactString('ts: 1735689600000')).toBe('ts: 1735689600000')
    expect(redactString('ts: 1777123456789')).toBe('ts: 1777123456789')
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
      message: 'Hello',
      user: {
        email: 'test@example.com',
        ip: '10.0.0.1'
      }
    }
    const result = redact(original)

    expect(result).toEqual({
      message: 'Hello',
      user: {
        email: '[REDACTED]',
        ip: '[REDACTED]'
      }
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
    class CustomCodeError extends Error {
      readonly code: string
      constructor(message: string, code: string) {
        super(message)
        this.name = 'CustomCodeError'
        this.code = code
      }
    }
    const err = new CustomCodeError('x@test.com', 'E1')
    const result = redact(err)
    expect(result).toBeInstanceOf(CustomCodeError)
    expect((result as CustomCodeError).code).toBe('E1')
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

  test('redacts sensitive object keys by name', () => {
    expect(redact({ password: 'hunter2' })).toEqual({
      password: '[REDACTED]'
    })
  })

  test('redacts sensitive nested keys but keeps unrelated keys', () => {
    const result = redact({ user: { apiKey: 'abc', name: 'ok' } })
    expect(result).toEqual({ user: { apiKey: '[REDACTED]', name: 'ok' } })
  })

  test('redacts a key added via extraKeys', () => {
    expect(redact({ custom: 'v' }, ['custom'])).toEqual({
      custom: '[REDACTED]'
    })
  })

  test('returns the same object reference when nothing needs redacting', () => {
    const original = { count: 3, message: 'all good', nested: { ok: true } }
    const result = redact(original)
    expect(result).toBe(original)
  })

  test('returns the same array reference when nothing needs redacting', () => {
    const original = [1, 'safe', { ok: true }]
    const result = redact(original)
    expect(result).toBe(original)
  })

  test('changed objects still return new references and leave the original unmutated', () => {
    const original = { user: { email: 'test@example.com', name: 'ok' } }
    const result = redact(original)
    expect(result).not.toBe(original)
    expect((result as typeof original).user).not.toBe(original.user)
    expect(original.user.email).toBe('test@example.com')
  })

  test('only clones the branch containing a change; sibling branches keep their reference', () => {
    const unrelated = { safe: true }
    const original = { a: unrelated, b: { email: 'x@example.com' } }
    const result = redact(original) as typeof original
    expect(result).not.toBe(original)
    expect(result.a).toBe(unrelated)
    expect(result.b).not.toBe(original.b)
  })
})

describe('isSensitiveKey', () => {
  test('matches case/format variants of built-in names', () => {
    expect(isSensitiveKey('Authorization')).toBe(true)
    expect(isSensitiveKey('x_api_key')).toBe(true)
    expect(isSensitiveKey('accessToken')).toBe(true)
  })

  test('does not match on substring (no false positives)', () => {
    expect(isSensitiveKey('tokenizer')).toBe(false)
    expect(isSensitiveKey('sessions')).toBe(false)
  })
})

describe('buildPinoRedactPaths', () => {
  test('includes bare and nested paths for simple keys, bracket-quoted for hyphenated keys', () => {
    const paths = buildPinoRedactPaths()
    expect(paths).toContain('password')
    expect(paths).toContain('*.password')
    expect(paths).toContain('["x-api-key"]')
  })
})

const sampleJwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('redactRequest', () => {
  test('redacts JWT in URL and returns new Request when changed', () => {
    const url = `http://localhost/api?jwt=${sampleJwt}`
    const req = new Request(url)
    const out = redactRequest(req)
    expect(out).not.toBe(req)
    expect(out.url).toContain('%5BREDACTED%5D')
    expect(out.url).not.toContain(sampleJwt)
  })

  test('redacts IPv4 in URL host without breaking Request() (no bracket placeholder in host)', () => {
    const req = new Request('http://192.168.1.1:3000/api')
    expect(() => redactRequest(req)).not.toThrow()
    const out = redactRequest(req)
    expect(out.url).toBe('http://redacted:3000/api')
    expect(() => new Request(out.url)).not.toThrow()
  })

  test('redacts 127.0.0.1 host safely', () => {
    const out = redactRequest(new Request('http://127.0.0.1:8080/'))
    expect(out.url).toBe('http://redacted:8080/')
  })

  test('redacts sensitive header values wholly by name, regardless of value pattern', () => {
    const req = new Request('http://localhost/', {
      headers: {
        authorization: `Bearer ${sampleJwt}`,
        'content-type': 'application/json',
        cookie: 'session=xyz'
      }
    })
    const out = redactRequest(req)
    expect(out.headers.get('authorization')).toBe('[REDACTED]')
    expect(out.headers.get('cookie')).toBe('[REDACTED]')
    expect(out.headers.get('content-type')).toBe('application/json')
  })

  test('returns same request when nothing would change', () => {
    const req = new Request('http://localhost/plain')
    expect(redactRequest(req)).toBe(req)
  })

  test('redacts a header without re-using the body of a consumed request', async () => {
    const req = new Request('http://localhost/user', {
      body: JSON.stringify({ name: 'alice' }),
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '10.0.0.1'
      },
      method: 'POST'
    })

    // Mirror Elysia consuming the body before logging runs.
    await req.text()

    const out = redactRequest(req)
    expect(out.headers.get('x-forwarded-for')).toBe('[REDACTED]')
    // The logging-only clone must not carry the original (already-consumed)
    // stream — re-attaching it is what threw "ReadableStream has already been
    // used" on Bun <=1.2.x. Asserting a null body guards the fix on every Bun
    // version, not just the ones where the reuse happens to throw.
    expect(out.body).toBeNull()
  })

  test('masks sensitive query parameters by key name while keeping others intact', () => {
    const req = new Request('http://h/p?token=abc123&email=a@b.co&keep=1')
    const out = redactRequest(req)
    expect(out.url).not.toContain('abc123')
    expect(out.url).toContain('email=%5BREDACTED%5D')
    expect(out.url).toContain('keep=1')
  })

  test('masks camelCase query parameter names', () => {
    const req = new Request('http://h/p?apiKey=x')
    const out = redactRequest(req)
    expect(out.url).not.toContain('apiKey=x')
    expect(out.url).toContain('apiKey=redacted')
  })

  test('masks a query parameter matching a custom redactKeys entry', () => {
    const req = new Request('http://h/p?promo=SECRET')
    const out = redactRequest(req, ['promo'])
    expect(out.url).not.toContain('SECRET')
    expect(out.url).toContain('promo=redacted')
  })
})

describe('error.cause redaction', () => {
  test('preserves and redacts error.cause instead of dropping it', () => {
    const outer = new Error('outer', { cause: new Error('a@b.co') })
    const result = redact({ error: outer }) as {
      error: Error & { cause?: Error }
    }
    expect(result.error.cause).toBeDefined()
    expect((result.error.cause as Error).message).toBe('[REDACTED]')
  })

  test('redacts a nested cause chain of depth 3', () => {
    const root = new Error('root: r@x.com')
    const mid = new Error('mid: m@x.com', { cause: root })
    const top = new Error('top: t@x.com', { cause: mid })
    const result = redact(top) as Error & { cause?: Error & { cause?: Error } }
    expect(result.message).toBe('top: [REDACTED]')
    expect(result.cause?.message).toBe('mid: [REDACTED]')
    expect(result.cause?.cause?.message).toBe('root: [REDACTED]')
  })

  test('does not loop on a self-referential cause', () => {
    const err = new Error('self') as Error & { cause?: unknown }
    err.cause = err
    const result = redact(err) as Error & { cause?: unknown }
    expect(result.cause).toBe('[Circular]')
  })

  test('cause stays non-enumerable on the redacted error, matching the original', () => {
    const outer = new Error('outer', { cause: new Error('inner') })
    const result = redact(outer) as Error
    expect(Object.propertyIsEnumerable.call(result, 'cause')).toBe(false)
  })

  test('preserves HttpError.internal as non-enumerable after redaction', () => {
    const err = new HttpError(500, 'boom', { internal: { note: 'x@y.com' } })
    const result = redact(err) as HttpError
    expect(Object.propertyIsEnumerable.call(result, 'internal')).toBe(false)
    expect(result.internal).toEqual({ note: '[REDACTED]' })
  })
})

describe('IPv4/IPv6 redaction precision', () => {
  test('does not mistake a dotted version string for an IPv4 address', () => {
    expect(redactString('Chrome/120.0.0.0 Safari/537.36')).toBe(
      'Chrome/120.0.0.0 Safari/537.36'
    )
    expect(redactString('v1.2.3.4')).toBe('v1.2.3.4')
  })

  test('still redacts real IPv4 addresses', () => {
    expect(redactString('IP is 192.168.1.1')).toBe('IP is [REDACTED]')
    expect(redactString('0.0.0.0')).toBe('[REDACTED]')
  })

  test('does not redact an out-of-range octet run', () => {
    expect(redactString('999.999.999.999')).toBe('999.999.999.999')
  })

  test('redacts IPv6 addresses', () => {
    expect(redactString('2001:db8::1')).toBe('[REDACTED]')
    expect(redactString('fe80:0:0:0:202:b3ff:fe1e:8329')).toBe('[REDACTED]')
    expect(redactString('::1')).toBe('[REDACTED]')
  })

  test('does not mistake a plain hex word for IPv6', () => {
    expect(redactString('deadbeef')).toBe('deadbeef')
  })

  test('does not mistake a clock time for IPv6', () => {
    expect(redactString('job ran at 12:30:45 today')).toBe(
      'job ran at 12:30:45 today'
    )
    expect(redactString('took 00:01:23.456')).toBe('took 00:01:23.456')
    expect(redactString('ratio 3:2:1')).toBe('ratio 3:2:1')
  })

  test('does not mistake a MAC address for IPv6', () => {
    expect(redactString('aa:bb:cc:dd:ee:ff')).toBe('aa:bb:cc:dd:ee:ff')
  })

  test('IPv6 redaction does not hang on adversarial input', () => {
    const input = `${'f:'.repeat(50_000)}1`
    const start = performance.now()
    redactString(input)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
