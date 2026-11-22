import { describe, expect, test } from 'bun:test'
import pino from 'pino'
import type { Options, Pino } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { buildPinoRedactPaths } from '../../src/utils/redact'

const MASK = '[REDACTED]'
const FAKE = 'not-a-real-token'

type Config = NonNullable<Options['config']>
type PinoConfig = NonNullable<Config['pino']>

const capturingFactory = (
  lines: string[],
  seenOptions: pino.LoggerOptions[] = []
): typeof pino =>
  ((opts: pino.LoggerOptions) => {
    seenOptions.push(opts)
    return pino(opts, {
      write: (line: string) => {
        lines.push(line)
      }
    })
  }) as unknown as typeof pino

const quiet = (config: Config = {}): Config => ({
  autoRedact: true,
  ...config,
  pino: { base: null, timestamp: false, ...config.pino }
})

/** What `store.pino` writes for `run`. */
const viaPlugin = (
  config: Config,
  run: (log: Pino) => void,
  seenOptions: pino.LoggerOptions[] = []
): string[] => {
  const lines: string[] = []
  run(
    createLogger(
      { config: quiet(config) },
      capturingFactory(lines, seenOptions)
    ).pino
  )
  return lines
}

/**
 * What a pino set up with only the path redaction `autoRedact` has always
 * given `store.pino` writes for `run`.
 */
const viaPaths = (config: Config, run: (log: Pino) => void): string[] => {
  const lines: string[] = []
  const { prettyPrint: _prettyPrint, ...pinoOptions } = quiet(config)
    .pino as PinoConfig
  const log = pino(
    {
      ...pinoOptions,
      level: 'info',
      redact: {
        censor: MASK,
        paths: buildPinoRedactPaths(config.redactKeys)
      }
    },
    {
      write: (line: string) => {
        lines.push(line)
      }
    }
  ) as unknown as Pino
  run(log)
  return lines
}

const expectSameAsPaths = (
  config: Config,
  run: (log: Pino) => void
): string[] => {
  const lines = viaPlugin(config, run)
  expect(lines).toEqual(viaPaths(config, run))
  return lines
}

const parsed = (lines: string[]): Record<string, unknown>[] =>
  lines.map(line => JSON.parse(line) as Record<string, unknown>)

const revoked = (): object => {
  const { proxy, revoke } = Proxy.revocable({ inner: 1 }, {})
  revoke()
  return proxy
}

const logRevokedProxy = (log: Pino) => {
  log.info({ accessToken: FAKE, nested: revoked() })
}

const logErrors = (log: Pino) => {
  log.info({ err: new Error('boom') })
  log.info(new Error('boom'))
}

// The stack names the test's own call stack, which differs between the two
// factories; the rest of the serialized error must match.
const scrubStacks = (lines: string[]) =>
  parsed(lines).map(line => {
    const err = line.err as Record<string, unknown> | undefined
    if (err && typeof err.stack === 'string') {
      err.stack = 'stack'
    }
    return line
  })

const deepNext = (levels: number, leaf: Record<string, unknown>) => {
  let node = leaf
  for (let level = 0; level < levels; level += 1) {
    node = { next: node }
  }
  return node
}

describe('store.pino under autoRedact masks the first argument by the plugin key rule', () => {
  test('masks every spelling of a sensitive key, at any depth and in arrays', () => {
    const lines = viaPlugin({}, log =>
      log.info(
        {
          Authorization: FAKE,
          accessToken: FAKE,
          access_token: FAKE,
          apiKey: 'not-a-real-key',
          clientSecret: 'not-a-real-secret',
          id: 7,
          jwt: FAKE,
          refreshToken: FAKE,
          stripeSecretKey: 'not-a-real-key',
          user: { profile: { password: 'not-a-real-password' } },
          webhooks: [{ id: 1, signingSecret: 'not-a-real-secret' }],
          x_api_key: 'not-a-real-key'
        },
        'job done'
      )
    )
    expect(parsed(lines)).toEqual([
      {
        Authorization: MASK,
        accessToken: MASK,
        access_token: MASK,
        apiKey: MASK,
        clientSecret: MASK,
        id: 7,
        jwt: MASK,
        level: 30,
        msg: 'job done',
        refreshToken: MASK,
        stripeSecretKey: MASK,
        user: { profile: { password: MASK } },
        webhooks: [{ id: 1, signingSecret: MASK }],
        x_api_key: MASK
      }
    ])
  })

  test('masks a redactKeys name in another spelling, nested two levels down', () => {
    const lines = viaPlugin({ redactKeys: ['customerSsn'] }, log =>
      log.info({ order: { billing: { customer_ssn: 'not-a-real-ssn' } } })
    )
    expect(parsed(lines)).toEqual([
      { level: 30, order: { billing: { customer_ssn: MASK } } }
    ])
  })

  test('masks the log object of a child and a grandchild logger', () => {
    const lines = viaPlugin({}, log => {
      log.child({ component: 'job' }).info({ accessToken: FAKE })
      log
        .child({ component: 'job' })
        .child({ part: 'inner' })
        .info({ accessToken: FAKE })
    })
    expect(parsed(lines)).toEqual([
      { accessToken: MASK, component: 'job', level: 30 },
      { accessToken: MASK, component: 'job', level: 30, part: 'inner' }
    ])
  })

  test('an object under a sensitive key is replaced whole', () => {
    const lines = viaPlugin({}, log =>
      log.info({
        a: { b: { clientSecret: { kind: 'bearer', value: 'x' } } }
      })
    )
    expect(parsed(lines)).toEqual([
      { a: { b: { clientSecret: MASK } }, level: 30 }
    ])
  })

  test('a value 5000 levels deep is masked without a stack overflow', () => {
    const input = { job: deepNext(5000, { accessToken: FAKE }) }
    const lines = viaPlugin({}, log => log.info(input))
    expect(lines.join('')).not.toContain(FAKE)
    expect(lines.join('')).toContain(`"accessToken":"${MASK}"`)
  })

  test('a cycle is written as a cycle, still masked', () => {
    const job: Record<string, unknown> = { accessToken: FAKE, id: 1 }
    job.self = job
    const lines = viaPlugin({}, log => log.info({ job }))
    expect(lines.join('')).not.toContain(FAKE)
    expect(parsed(lines)[0]?.job).toMatchObject({ accessToken: MASK, id: 1 })
  })

  test('one object referenced from two keys is masked on both', () => {
    const shared = { accessToken: FAKE }
    const lines = viaPlugin({}, log => log.info({ a: shared, b: shared }))
    expect(lines.join('')).not.toContain(FAKE)
    expect(parsed(lines)[0]?.a).toEqual({ accessToken: MASK })
  })

  test('the logged object is not mutated', () => {
    const inner = { accessToken: FAKE }
    const input = { user: { profile: inner } }
    viaPlugin({}, log => log.info(input))
    expect(inner.accessToken).toBe(FAKE)
    const { profile } = input.user as Record<string, unknown>
    expect(profile).toBe(inner)
  })

  test('a user logMethod that swaps arguments still gets the object masked', () => {
    const lines = viaPlugin(
      {
        pino: {
          hooks: {
            logMethod(
              this: unknown,
              args: unknown[],
              method: (...passed: unknown[]) => unknown
            ) {
              Reflect.apply(method, this, [args[1], args[0]])
            }
          }
        }
      },
      log =>
        (log.info as (...passed: unknown[]) => void)('swapped', {
          accessToken: FAKE
        })
    )
    expect(parsed(lines)).toEqual([
      { accessToken: MASK, level: 30, msg: 'swapped' }
    ])
  })

  test('only undefined is left alone under a sensitive key', () => {
    const lines = viaPlugin({}, log =>
      log.info({
        apiKey: Symbol('k'),
        clientSecret: () => 1,
        id: 1,
        token: undefined
      })
    )
    expect(parsed(lines)).toEqual([
      { apiKey: MASK, clientSecret: MASK, id: 1, level: 30 }
    ])
  })

  test('a function with a toJSON under a sensitive key is masked', () => {
    const lines = viaPlugin({}, log =>
      log.info({ accessToken: Object.assign(() => 1, { toJSON: () => FAKE }) })
    )
    expect(lines.join('')).not.toContain(FAKE)
    expect(parsed(lines)[0]?.accessToken).toBe(MASK)
  })

  test('a non-plain value under a sensitive key is masked whole', () => {
    const lines = viaPlugin({}, log => log.info({ accessToken: new Date(0) }))
    expect(parsed(lines)[0]?.accessToken).toBe(MASK)
  })

  test('a cycle back to the logged object masks the inner copy under a serialized key', () => {
    const lines = viaPlugin(
      { pino: { serializers: { accessToken: () => 'short' } } },
      log => {
        const record: Record<string, unknown> = {
          accessToken: FAKE,
          edge: {}
        }
        ;(record.edge as Record<string, unknown>).root = record
        log.info(record)
      }
    )
    expect(lines.join('')).not.toContain(FAKE)
    const [line] = parsed(lines)
    expect(line?.accessToken).toBe('short')
    const root = (line?.edge as Record<string, unknown>)?.root as Record<
      string,
      unknown
    >
    expect(root.accessToken).toBe(MASK)
  })

  test('a cycle back to the logged object prints the same shape as path redaction apart from the mask', () => {
    const record: Record<string, unknown> = { password: FAKE }
    record.edge = record
    const lines = viaPlugin({}, log => log.info(record))
    const pathLines = viaPaths({}, log => log.info(record))
    // Path redaction does not reach the cycle two levels down; the plugin's
    // copy prints the same shape, masked there too.
    expect(lines).toEqual([
      `{"level":30,"password":"${MASK}","edge":{"edge":{"edge":"[Circular]","password":"${MASK}"},"password":"${MASK}"}}\n`
    ])
    expect(pathLines).toEqual([
      `{"level":30,"password":"${MASK}","edge":{"edge":{"edge":"[Circular]","password":"${FAKE}"},"password":"${MASK}"}}\n`
    ])
  })

  test('an own __proto__ key is masked without polluting Object.prototype', () => {
    const input = JSON.parse(
      `{"__proto__":{"accessToken":"${FAKE}"},"id":1}`
    ) as Record<string, unknown>
    const lines = viaPlugin({}, log => log.info(input))
    const line = parsed(lines)[0] ?? {}
    const protoEntry = Object.getOwnPropertyDescriptor(line, '__proto__')
    expect(protoEntry?.value).toEqual({ accessToken: MASK })
    expect(({} as Record<string, unknown>).accessToken).toBeUndefined()
  })

  test('everything path redaction masked before is still masked', () => {
    const lines = expectSameAsPaths({}, log => {
      log.info({ password: 'not-a-real-password' })
      log.info({ user: { password: 'not-a-real-password' } })
      log.info({ 'set-cookie': 'a=b' })
    })
    const [first, second, third] = parsed(lines)
    expect(first?.password).toBe(MASK)
    expect(second?.user).toEqual({ password: MASK })
    expect(third?.['set-cookie']).toBe(MASK)
  })
})

describe('store.pino under autoRedact hands pino the same object when there is nothing to mask', () => {
  test('a formatters.log sees the logged object itself, or a masked copy', () => {
    const seen: unknown[] = []
    const config: Config = {
      pino: {
        formatters: {
          log: (object: Record<string, unknown>) => {
            seen.push(object)
            return object
          }
        }
      }
    }
    const plain = { id: 1, user: { name: 'x' } }
    const sensitive = { accessToken: FAKE }
    viaPlugin(config, log => {
      log.info(plain)
      log.info(sensitive)
    })
    expect(seen[0]).toBe(plain)
    expect(seen[1]).not.toBe(sensitive)
  })
})

describe('store.pino under autoRedact leaves what is not plain data to path redaction', () => {
  test('a nested object with a getter keeps its sibling sensitive key in clear', () => {
    let pluginCalls = 0
    const lines = viaPlugin({}, log =>
      log.info({
        data: {
          accessToken: FAKE,
          get computed() {
            pluginCalls += 1
            return 'v'
          }
        }
      })
    )
    let pathsCalls = 0
    const pathLines = viaPaths({}, log =>
      log.info({
        data: {
          accessToken: FAKE,
          get computed() {
            pathsCalls += 1
            return 'v'
          }
        }
      })
    )
    expect(lines).toEqual(pathLines)
    expect(pluginCalls).toBe(1)
    expect(lines.join('')).toContain(FAKE)
  })

  test('an object with a hidden or symbol-keyed accessor is left to pino', () => {
    let getterCalls = 0
    const hiddenGetter = {}
    Object.defineProperty(hiddenGetter, 'peek', {
      enumerable: false,
      get() {
        getterCalls += 1
        return 'v'
      }
    })
    const symbolKey = Symbol('s')
    const symbolGetter = {}
    Object.defineProperty(symbolGetter, symbolKey, {
      enumerable: true,
      get() {
        getterCalls += 1
        return 'v'
      }
    })
    const lines = viaPlugin({}, log =>
      log.info({
        accessToken: FAKE,
        nested: { a: hiddenGetter, b: symbolGetter }
      })
    )
    let pathsCalls = 0
    const pathHidden = {}
    Object.defineProperty(pathHidden, 'peek', {
      enumerable: false,
      get() {
        pathsCalls += 1
        return 'v'
      }
    })
    const pathSymbol = {}
    Object.defineProperty(pathSymbol, symbolKey, {
      enumerable: true,
      get() {
        pathsCalls += 1
        return 'v'
      }
    })
    const pathLines = viaPaths({}, log =>
      log.info({
        accessToken: FAKE,
        nested: { a: pathHidden, b: pathSymbol }
      })
    )
    const [line] = parsed(lines)
    const [pathLine] = parsed(pathLines)
    expect(line?.accessToken).toBe(MASK)
    expect(line?.nested).toEqual(pathLine?.nested)
    expect(getterCalls).toBe(pathsCalls)
  })

  test('hidden and symbol-keyed properties survive the masked copy', () => {
    const seen: Record<string, unknown>[] = []
    const symbolKey = Symbol('s')
    const list: unknown[] = [1]
    list[2] = 3
    const logged: Record<string, unknown> = {
      accessToken: FAKE,
      list
    }
    Object.defineProperty(logged, 'hidden', {
      enumerable: false,
      value: 'kept'
    })
    Object.defineProperty(logged, symbolKey, { enumerable: true, value: 'k' })
    viaPlugin(
      {
        pino: {
          formatters: {
            log: (object: Record<string, unknown>) => {
              seen.push(object)
              return object
            }
          }
        }
      },
      log => log.info(logged)
    )
    const copy = seen[0] as Record<string | symbol, unknown>
    expect(copy).not.toBe(logged)
    expect(Object.getOwnPropertyDescriptor(copy, 'hidden')).toMatchObject({
      enumerable: false,
      value: 'kept'
    })
    expect(copy[symbolKey]).toBe('k')
    expect(1 in (copy.list as unknown[])).toBe(false)
  })

  test('pino still infers the message from a non-enumerable err', () => {
    const record: Record<string, unknown> = { accessToken: FAKE }
    Object.defineProperty(record, 'err', { value: new Error('boom') })
    const lines = viaPlugin({}, log => log.info(record))
    const pathLines = viaPaths({}, log => log.info(record))
    expect(parsed(lines)[0]?.msg).toBe(parsed(pathLines)[0]?.msg)
    expect(parsed(lines)[0]?.accessToken).toBe(MASK)
  })

  test('a sparse array is masked at its only element', () => {
    const list: unknown[] = []
    list[39_999] = { accessToken: FAKE }
    const lines = viaPlugin({}, log => log.info({ list }))
    const printed = parsed(lines)[0]?.list as
      | Record<string, unknown>[]
      | undefined
    expect(printed?.at(39_999)?.accessToken).toBe(MASK)
    expect(lines.join('')).not.toContain(FAKE)
  })

  test('a nested object is not asked for its prototype twice', () => {
    let calls = 0
    const target = { inner: 1 }
    const guarded = new Proxy(target, {
      getPrototypeOf(subject) {
        calls += 1
        if (calls > 1) {
          throw new Error('read twice')
        }
        return Object.getPrototypeOf(subject)
      }
    })
    const lines = viaPlugin({}, log =>
      log.info({ accessToken: FAKE, nested: { guarded } })
    )
    expect(parsed(lines)[0]?.accessToken).toBe(MASK)
  })

  test('a nested object with a toJSON is printed through it, but toJSON: false is plain data', () => {
    const lines = expectSameAsPaths({}, log =>
      log.info({ data: { accessToken: FAKE, toJSON: () => ({ shown: 1 }) } })
    )
    expect(parsed(lines)).toEqual([{ data: { shown: 1 }, level: 30 }])

    const masked = viaPlugin({}, log =>
      log.info({ data: { accessToken: FAKE, toJSON: false } })
    )
    const data = parsed(masked)[0]?.data as Record<string, unknown>
    expect(data.accessToken).toBe(MASK)
  })

  test('a class instance, a Map, a Date, a Buffer and an Error under other keys', () => {
    class Session {
      accessToken = FAKE
    }
    expectSameAsPaths({}, log =>
      log.info({
        buf: Buffer.from('x'),
        err2: new Error('boom'),
        m: new Map([['accessToken', FAKE]]),
        session: new Session(),
        when: new Date(0)
      })
    )
  })

  test('an Error under err and an Error as the first argument', () => {
    expect(scrubStacks(viaPlugin({}, logErrors))).toEqual(
      scrubStacks(viaPaths({}, logErrors))
    )
  })

  test('a top-level array, a string-only call and printf-style args', () => {
    expectSameAsPaths({}, log => {
      ;(log.info as (...passed: unknown[]) => void)([1, { accessToken: FAKE }])
      log.info('just a message')
      log.info('value %o', { accessToken: FAKE })
    })
  })

  test('a key with a serializer is handed the logged value', () => {
    const lines = viaPlugin(
      {
        pino: {
          serializers: {
            apiKey: (value: string) => `len:${value.length}`
          }
        }
      },
      log => {
        log.info({ apiKey: 'abcdef', refreshToken: FAKE })
        log
          .child({}, { serializers: { accessToken: (v: string) => v.length } })
          .info({ accessToken: 'abcdef', refreshToken: FAKE })
      }
    )
    expect(parsed(lines)).toEqual([
      { apiKey: 'len:6', level: 30, refreshToken: MASK },
      { accessToken: 6, level: 30, refreshToken: MASK }
    ])
  })

  test('child bindings, pino.base and mixin fields are not key-masked', () => {
    const bindingLines = expectSameAsPaths({}, log =>
      log.child({ accessToken: FAKE }).info('child')
    )
    expect(bindingLines.join('')).toContain(FAKE)
    const baseLines = expectSameAsPaths(
      { pino: { base: { accessToken: FAKE } } },
      log => log.info('base')
    )
    expect(baseLines.join('')).toContain(FAKE)
    const mixinLines = expectSameAsPaths(
      { pino: { mixin: () => ({ accessToken: FAKE }) } },
      log => log.info('mixin')
    )
    expect(mixinLines.join('')).toContain(FAKE)

    const maskedBinding = parsed(
      viaPlugin({}, log => log.child({ password: FAKE }).info('child'))
    )
    expect(maskedBinding[0]?.password).toBe(MASK)
    const maskedBase = parsed(
      viaPlugin({ pino: { base: { password: FAKE } } }, log => log.info('b'))
    )
    expect(maskedBase[0]?.password).toBe(MASK)
    const maskedMixin = parsed(
      viaPlugin({ pino: { mixin: () => ({ password: FAKE }) } }, log =>
        log.info('m')
      )
    )
    expect(maskedMixin[0]?.password).toBe(MASK)
  })

  test('a revoked Proxy nested next to a top-level sensitive key', () => {
    let pluginLines: string[] | undefined
    let pathLines: string[] | undefined
    try {
      pluginLines = viaPlugin({}, logRevokedProxy)
    } catch {
      pluginLines = undefined
    }
    try {
      pathLines = viaPaths({}, logRevokedProxy)
    } catch {
      pathLines = undefined
    }
    expect(pluginLines === undefined).toBe(pathLines === undefined)
    if (pluginLines !== undefined) {
      expect(parsed(pluginLines)[0]?.accessToken).toBe(MASK)
    }
  })
})

describe('store.pino without the automatic masking', () => {
  test('autoRedact false prints the value and adds no hooks', () => {
    const seenOptions: pino.LoggerOptions[] = []
    const lines = viaPlugin(
      { autoRedact: false },
      log => log.info({ accessToken: FAKE }),
      seenOptions
    )
    expect(parsed(lines)[0]?.accessToken).toBe(FAKE)
    expect('hooks' in (seenOptions[0] ?? {})).toBe(false)
  })

  test('a user pino.redact masks its paths and adds no hooks', () => {
    const seenOptions: pino.LoggerOptions[] = []
    const lines = viaPlugin(
      { pino: { redact: ['custom'] } },
      log => log.info({ accessToken: FAKE, custom: 'not-a-real-secret' }),
      seenOptions
    )
    expect(parsed(lines)[0]?.accessToken).toBe(FAKE)
    expect(parsed(lines)[0]?.custom).toBe('[Redacted]')
    expect('hooks' in (seenOptions[0] ?? {})).toBe(false)
  })
})
