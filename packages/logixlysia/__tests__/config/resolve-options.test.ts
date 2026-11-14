import { describe, expect, test } from 'bun:test'
import { resolveOptions } from '../../src/config/resolve-options'

const resolve = (
  redactPatterns: RegExp[],
  autoRedact = true
): RegExp[] | undefined =>
  resolveOptions({ config: { autoRedact, redactPatterns } }).config
    ?.redactPatterns

describe('resolveOptions redactPatterns', () => {
  test('makes a non-global pattern global', () => {
    expect(resolve([/cust_\d+/u])?.[0]?.flags).toBe('gu')
  })

  test('drops the sticky flag and keeps the others', () => {
    expect(resolve([/cust_\d+/giuy])?.[0]?.flags).toBe('giu')
  })

  test('is idempotent', () => {
    const once = resolveOptions({
      config: { autoRedact: true, redactPatterns: [/cust_\d+/uy] }
    })
    const twice = resolveOptions(once)
    expect(twice.config?.redactPatterns?.[0]?.flags).toBe('gu')
    expect(twice.config?.redactPatterns?.[0]?.source).toBe('cust_\\d+')
  })

  test('leaves an absent or empty list alone', () => {
    expect(
      resolveOptions({ config: {} }).config?.redactPatterns
    ).toBeUndefined()
    expect(resolve([], false)).toEqual([])
  })

  test('throws without autoRedact, and not under the prod preset', () => {
    expect(() => resolve([/cust_\d+/u], false)).toThrow(
      'invalid redactPatterns — needs autoRedact: true'
    )
    expect(() =>
      resolveOptions({
        config: { redactPatterns: [/cust_\d+/u] },
        preset: 'prod'
      })
    ).not.toThrow()
  })

  test('throws for a pattern that matches the empty string', () => {
    expect(() => resolve([/x*/u])).toThrow('x* can match nothing')
  })

  test('throws for a zero-width pattern that needs context to match', () => {
    expect(() => resolve([/\b/u])).toThrow('can match nothing')
    expect(() => resolve([/(?=a)/u])).toThrow('can match nothing')
  })

  test('throws for an entry that is not a RegExp', () => {
    expect(() => resolve(['cust_\\d+'] as unknown as RegExp[])).toThrow(
      'invalid redactPatterns — expected a RegExp, got string'
    )
  })

  test('names the type of an entry JSON cannot serialize', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(() => resolve([10n] as unknown as RegExp[])).toThrow(
      'expected a RegExp, got bigint'
    )
    expect(() => resolve([cycle] as unknown as RegExp[])).toThrow(
      'expected a RegExp, got object'
    )
  })

  test('throws for a list that is not an array', () => {
    expect(() =>
      resolveOptions({
        config: {
          autoRedact: true,
          redactPatterns: /cust_\d+/u as unknown as RegExp[]
        }
      })
    ).toThrow('invalid redactPatterns — expected an array')
  })
})

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

  test('undefined config keys keep the preset value', () => {
    const resolved = resolveOptions({
      config: { autoRedact: undefined, requestId: undefined },
      preset: 'prod'
    })

    expect(resolved.config?.autoRedact).toBe(true)
    expect(resolved.config?.requestId).toBe(true)
  })

  test('undefined config keys no preset defines stay absent', () => {
    const resolved = resolveOptions({
      config: { logFilePath: undefined },
      preset: 'dev'
    })

    expect(Object.keys(resolved.config ?? {})).not.toContain('logFilePath')
  })

  test('without a preset the config is returned as given', () => {
    const resolved = resolveOptions({ config: { autoRedact: undefined } })

    expect(resolved.config?.autoRedact).toBeUndefined()
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

  test('throws on maxFiles: 0', () => {
    expect(() =>
      resolveOptions({ config: { logRotation: { maxFiles: 0 } } })
    ).toThrow('logixlysia: invalid logRotation config')
  })

  test('throws on a negative maxFiles', () => {
    expect(() =>
      resolveOptions({ config: { logRotation: { maxFiles: -1 } } })
    ).toThrow('logixlysia: invalid logRotation config')
  })

  test('accepts a positive integer maxFiles', () => {
    const resolved = resolveOptions({
      config: { logRotation: { maxFiles: 3 } }
    })

    expect(resolved.config?.logRotation?.maxFiles).toBe(3)
  })

  test("accepts a duration string maxFiles like '7d'", () => {
    const resolved = resolveOptions({
      config: { logRotation: { maxFiles: '7d' } }
    })

    expect(resolved.config?.logRotation?.maxFiles).toBe('7d')
  })

  test('throws when slowThreshold exceeds verySlowThreshold', () => {
    expect(() =>
      resolveOptions({
        config: { slowThreshold: 1000, verySlowThreshold: 500 }
      })
    ).toThrow('logixlysia: invalid formatting config')
  })

  test('accepts slowThreshold at or below verySlowThreshold', () => {
    const resolved = resolveOptions({
      config: { slowThreshold: 500, verySlowThreshold: 1000 }
    })

    expect(resolved.config?.slowThreshold).toBe(500)
    expect(resolved.config?.verySlowThreshold).toBe(1000)
  })

  test('throws on a consoleFormat other than json or text', () => {
    expect(() =>
      resolveOptions({
        config: { consoleFormat: 'pretty' as unknown as 'json' },
        preset: 'prod'
      })
    ).toThrow("consoleFormat must be 'json' or 'text', got \"pretty\"")
  })

  test('throws on a negative slowThreshold', () => {
    expect(() => resolveOptions({ config: { slowThreshold: -1 } })).toThrow(
      'logixlysia: invalid formatting config'
    )
  })

  test('throws on a logFilter level that is not a known level', () => {
    expect(() =>
      resolveOptions({ config: { logFilter: { level: ['WARN' as never] } } })
    ).toThrow('logixlysia: invalid logFilter config')
  })

  test('throws when logFilter.level is not an array', () => {
    expect(() =>
      resolveOptions({ config: { logFilter: { level: 'WARNING' as never } } })
    ).toThrow('logixlysia: invalid logFilter config')
  })

  test('throws when logFilter.accessLine.include is not an array', () => {
    expect(() =>
      resolveOptions({
        config: { logFilter: { accessLine: { include: '/api' as never } } }
      })
    ).toThrow('logixlysia: invalid logFilter config')
  })

  test('throws when logFilter.accessLine.exclude holds an empty string', () => {
    expect(() =>
      resolveOptions({
        config: { logFilter: { accessLine: { exclude: [''] } } }
      })
    ).toThrow('accessLine.exclude must be an array of non-empty glob strings')
  })

  test('accepts logFilter.accessLine globs without a level', () => {
    const resolved = resolveOptions({
      config: {
        logFilter: {
          accessLine: { exclude: ['/health'], include: ['/api/**'] }
        }
      }
    })

    expect(resolved.config?.logFilter?.accessLine?.exclude).toEqual(['/health'])
  })

  test.each(['include', 'exclude'] as const)(
    'throws when logFilter.%s is not an array',
    key => {
      expect(() =>
        resolveOptions({ config: { logFilter: { [key]: '/api' as never } } })
      ).toThrow(`logFilter config — ${key} must be an array`)
    }
  )

  test.each(['include', 'exclude'] as const)(
    'throws when logFilter.%s holds a non-string or empty entry',
    key => {
      expect(() =>
        resolveOptions({ config: { logFilter: { [key]: [1] as never } } })
      ).toThrow(`${key} must be an array of non-empty glob strings`)
      expect(() =>
        resolveOptions({ config: { logFilter: { [key]: [''] } } })
      ).toThrow(`${key} must be an array of non-empty glob strings`)
    }
  )

  test('names the key and the glob when a logFilter glob is unusable', () => {
    expect(() =>
      resolveOptions({ config: { logFilter: { exclude: ['/a/**/b/**'] } } })
    ).toThrow("invalid logFilter config — exclude: '/a/**/b/**' —")
  })

  test('throws for a logFilter that is not an object', () => {
    expect(() =>
      resolveOptions({ config: { logFilter: '/health' as never } })
    ).toThrow('logFilter must be an object')
    expect(() =>
      resolveOptions({ config: { logFilter: ['/health'] as never } })
    ).toThrow('logFilter must be an object')
  })

  test('validates a logFilter edited after an earlier resolve', () => {
    const logFilter = { exclude: ['/health'] }
    resolveOptions({ config: { logFilter } })

    logFilter.exclude = ['/a/**/b/**']

    expect(() => resolveOptions({ config: { logFilter } })).toThrow(
      'invalid logFilter config'
    )
  })

  test('accepts the four log levels in logFilter', () => {
    const resolved = resolveOptions({
      config: { logFilter: { level: ['DEBUG', 'INFO', 'WARNING', 'ERROR'] } }
    })

    expect(resolved.config?.logFilter?.level).toEqual([
      'DEBUG',
      'INFO',
      'WARNING',
      'ERROR'
    ])
  })

  test('throws on useTransportsOnly without a transport', () => {
    expect(() =>
      resolveOptions({ config: { useTransportsOnly: true } })
    ).toThrow('useTransportsOnly')
    expect(() =>
      resolveOptions({ config: { transports: [], useTransportsOnly: true } })
    ).toThrow('useTransportsOnly')
  })

  test('accepts useTransportsOnly with a transport', () => {
    const transports = [{ log: () => {} }]
    const resolved = resolveOptions({
      config: { transports, useTransportsOnly: true }
    })

    expect(resolved.config?.transports).toBe(transports)
    expect(resolved.config?.useTransportsOnly).toBe(true)
  })

  test('throws on a non-finite or negative flushTimeoutMs', () => {
    expect(() =>
      resolveOptions({ config: { flushTimeoutMs: Number.POSITIVE_INFINITY } })
    ).toThrow('flushTimeoutMs')
    expect(() =>
      resolveOptions({ config: { flushTimeoutMs: Number.NaN } })
    ).toThrow('flushTimeoutMs')
    expect(() => resolveOptions({ config: { flushTimeoutMs: -1 } })).toThrow(
      'flushTimeoutMs'
    )
  })

  test('accepts flushTimeoutMs at the timer ceiling', () => {
    expect(
      resolveOptions({ config: { flushTimeoutMs: 2_147_483_647 } }).config
        ?.flushTimeoutMs
    ).toBe(2_147_483_647)
  })

  test('throws on a flushTimeoutMs above the timer ceiling', () => {
    expect(() =>
      resolveOptions({ config: { flushTimeoutMs: 2_147_483_648 } })
    ).toThrow('flushTimeoutMs')
  })

  test('throws on a flushTimeoutMs of Number.MAX_SAFE_INTEGER', () => {
    expect(() =>
      resolveOptions({ config: { flushTimeoutMs: Number.MAX_SAFE_INTEGER } })
    ).toThrow('flushTimeoutMs')
  })

  test('accepts flushTimeoutMs of 0 and a positive number', () => {
    expect(
      resolveOptions({ config: { flushTimeoutMs: 0 } }).config?.flushTimeoutMs
    ).toBe(0)
    expect(
      resolveOptions({ config: { flushTimeoutMs: 250 } }).config?.flushTimeoutMs
    ).toBe(250)
  })

  test('throws on a requestId header that is not a valid header name', () => {
    const headers = [
      'X Request Id',
      'X-Request-Id:',
      'Ünïcode',
      'a\nb',
      42 as unknown as string
    ]

    for (const header of headers) {
      expect(() =>
        resolveOptions({ config: { requestId: { header } } })
      ).toThrow('requestId')
    }
  })

  test('accepts a valid, blank or absent requestId header', () => {
    for (const header of ['X-Correlation-Id', 'x_trace.id', '', '  ']) {
      expect(() =>
        resolveOptions({ config: { requestId: { header } } })
      ).not.toThrow()
    }
    expect(() => resolveOptions({ config: { requestId: true } })).not.toThrow()
    expect(() => resolveOptions({ config: { requestId: {} } })).not.toThrow()
  })
})
