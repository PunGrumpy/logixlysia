import { describe, expect, test } from 'bun:test'

import { resolveOptions } from '../../src/config/resolve-options'

describe('resolveOptions', () => {
  test('prod preset enables autoRedact and disables banner', () => {
    const resolved = resolveOptions({ preset: 'prod' })

    expect(resolved.config?.autoRedact).toBe(true)
    expect(resolved.config?.showStartupMessage).toBe(false)
    expect(resolved.config?.showContextTree).toBe(false)
  })

  test('explicit config overrides preset', () => {
    const resolved = resolveOptions({
      config: {
        autoRedact: false,
        showStartupMessage: true
      },
      preset: 'prod'
    })

    expect(resolved.config?.autoRedact).toBe(false)
    expect(resolved.config?.showStartupMessage).toBe(true)
  })

  test('dev preset enables pretty print', () => {
    const resolved = resolveOptions({ preset: 'dev' })

    expect(resolved.config?.pino?.prettyPrint).toBe(true)
    expect(resolved.config?.showStartupMessage).toBe(true)
  })

  test('valid logRotation config passes through unchanged', () => {
    const resolved = resolveOptions({
      config: {
        logRotation: {
          compression: 'gzip',
          interval: '1d',
          maxFiles: 5,
          maxSize: '10m'
        }
      }
    })

    expect(resolved.config?.logRotation).toEqual({
      compression: 'gzip',
      interval: '1d',
      maxFiles: 5,
      maxSize: '10m'
    })
  })

  test('throws on an invalid logRotation.maxSize', () => {
    expect(() =>
      resolveOptions({ config: { logRotation: { maxSize: '' } } })
    ).toThrow('logixlysia: invalid logRotation config')
  })

  test('throws on an invalid logRotation.interval', () => {
    expect(() =>
      resolveOptions({ config: { logRotation: { interval: 'nope' } } })
    ).toThrow('logixlysia: invalid logRotation config')
  })

  test('throws on an invalid logRotation.maxFiles', () => {
    expect(() =>
      resolveOptions({ config: { logRotation: { maxFiles: 'nope' } } })
    ).toThrow('logixlysia: invalid logRotation config')
  })

  test('throws on an invalid logRotation.compression', () => {
    expect(() =>
      resolveOptions({
        config: {
          logRotation: { compression: 'brotli' as never }
        }
      })
    ).toThrow('logixlysia: invalid logRotation config')
  })

  test('validates logRotation after preset merge', () => {
    expect(() =>
      resolveOptions({
        config: { logRotation: { maxSize: -5 } },
        preset: 'prod'
      })
    ).toThrow('logixlysia: invalid logRotation config')
  })

  test('throws on an unknown preset', () => {
    expect(() => resolveOptions({ preset: 'staging' as never })).toThrow(
      'logixlysia: invalid preset'
    )
  })

  test('rejects unsupported head sampling levels', () => {
    expect(() =>
      resolveOptions({
        config: { sampling: { head: { TRACE: 50 } as never } }
      })
    ).toThrow('head.TRACE is not a valid level')
  })

  test('accepts valid head sampling levels', () => {
    const resolved = resolveOptions({
      config: {
        sampling: {
          head: { DEBUG: 10, ERROR: 100, INFO: 50, WARNING: 75 }
        }
      }
    })

    expect(resolved.config?.sampling?.head).toEqual({
      DEBUG: 10,
      ERROR: 100,
      INFO: 50,
      WARNING: 75
    })
  })

  test('validates tail.paths is an array', () => {
    expect(() =>
      resolveOptions({
        config: { sampling: { tail: { paths: 'not-an-array' as never } } }
      })
    ).toThrow('tail.paths must be an array')
  })

  test('validates tail.paths array contains non-empty strings', () => {
    const resolved = resolveOptions({
      config: { sampling: { tail: { paths: ['/api/*', '/checkout/**'] } } }
    })

    expect(resolved.config?.sampling?.tail?.paths).toEqual([
      '/api/*',
      '/checkout/**'
    ])
  })
})
