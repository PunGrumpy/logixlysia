import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { Options } from '../../src/interfaces'
import { spyConsole } from '../_helpers/console'
import { sleep } from '../_helpers/sleep'

const NOW = new Date('2026-01-02T03:04:05.678Z')
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const DURATION = /\d+(?:\.\d+)?m?s/u

const buildApp = (options: Options) =>
  new Elysia()
    .use(logixlysia(options))
    .get('/ok', () => 'ok')
    .get('/boom', () => {
      throw new Error('Payment failed', {
        cause: new Error('card declined')
      })
    })
    .get('/checkout', ({ log }) => {
      log.info('checkout started', { cartId: 'cart_1' })
      return 'ok'
    })
    .get('/merged', ({ log }) => {
      log.mergeContext({ cartId: 'cart_1', items: 3 })
      return 'ok'
    })
    .post('/signup', ({ log }) => {
      log.info('signup', { email: 'ada@example.com', password: 'hunter2' })
      return 'ok'
    })
    .get('/users/:email', () => 'ok')
    .get('/multiline', ({ log }) => {
      log.info('line one\nline two', { note: 'first\nsecond' })
      return 'ok'
    })

/** Every console write the requests caused, as `method: text`, sorted. */
const consoleWrites = async (
  options: Options,
  requests: Request[]
): Promise<string[]> => {
  const { restore, spies } = spyConsole()
  try {
    const app = buildApp(options)
    await Promise.all(requests.map(request => app.handle(request)))
    await sleep(10)
  } finally {
    restore()
  }
  return Object.entries(spies)
    .flatMap(([method, spy]) =>
      spy.mock.calls.map(call => `${method}: ${String(call[0])}`)
    )
    .toSorted()
}

const get = (path: string): Request => new Request(`http://localhost${path}`)

/** The one console write a request caused, parsed as JSON. */
const jsonRecord = async (
  options: Options,
  request: Request
): Promise<Record<string, unknown>> => {
  const writes = await consoleWrites(options, [request])
  expect(writes).toHaveLength(1)
  const text = (writes[0] ?? '').replace(/^\w+: /u, '')
  expect(text).not.toContain('\n')
  return JSON.parse(text) as Record<string, unknown>
}

afterEach(() => {
  setSystemTime()
})

describe.each(['json', 'prod'] as const)(
  'preset %s writes one JSON line per record',
  preset => {
    const options: Options = { preset }

    test('an access line carries timestamp, level, request, status and duration in that order', async () => {
      const record = await jsonRecord(options, get('/ok'))

      expect(record.timestamp).toMatch(ISO_TIMESTAMP)
      expect(record.level).toBe('INFO')
      expect(record.message).toBe('')
      expect(record.request).toEqual({
        method: 'GET',
        url: 'http://localhost/ok'
      })
      expect(record.status).toBe(200)
      expect(typeof record.durationMs).toBe('number')
      const expectedKeys =
        preset === 'prod'
          ? [
              'timestamp',
              'level',
              'message',
              'request',
              'status',
              'durationMs',
              'context'
            ]
          : ['timestamp', 'level', 'message', 'request', 'status', 'durationMs']
      expect(Object.keys(record)).toEqual(expectedKeys)
    })

    test('a 500 carries the error and its cause', async () => {
      const record = await jsonRecord(options, get('/boom'))

      expect(record.level).toBe('ERROR')
      expect(record.status).toBe(500)
      expect(record.message).toBe('Payment failed')
      expect(record.error).toMatchObject({
        cause: { message: 'card declined', name: 'Error' },
        message: 'Payment failed',
        name: 'Error'
      })
    })

    test('a log.info line replaces the access line and carries its context', async () => {
      const record = await jsonRecord(options, get('/checkout'))

      expect(record.level).toBe('INFO')
      expect(record.message).toBe('checkout started')
      expect(record.context).toMatchObject({ cartId: 'cart_1' })
      expect(record.status).toBeUndefined()
    })

    test('a value with a newline stays on one line and round-trips', async () => {
      const record = await jsonRecord(options, get('/multiline'))

      expect(record.message).toBe('line one\nline two')
      expect(record.context).toMatchObject({ note: 'first\nsecond' })
    })
  }
)

describe('preset prod JSON line redaction', () => {
  test('masks a secret in the path and in the context', async () => {
    const path = await jsonRecord({ preset: 'prod' }, get('/users/ada@x.io'))
    const signup = await jsonRecord(
      { preset: 'prod' },
      new Request('http://localhost/signup', { method: 'POST' })
    )

    expect(JSON.stringify(path)).not.toContain('ada@x.io')
    expect(path.request).toEqual({
      method: 'GET',
      url: 'http://localhost/users/[REDACTED]'
    })
    expect(JSON.stringify(signup)).not.toContain('hunter2')
    expect(JSON.stringify(signup)).not.toContain('ada@example.com')
    expect(signup.context).toMatchObject({ password: '[REDACTED]' })
  })

  test('carries the request id in the context', async () => {
    const record = await jsonRecord(
      { preset: 'prod' },
      new Request('http://localhost/ok', {
        headers: { 'x-request-id': 'req-42' }
      })
    )

    expect(record.context).toEqual({ requestId: 'req-42' })
  })
})

describe('consoleFormat', () => {
  test("'text' brings the text line back under the prod preset", async () => {
    setSystemTime(NOW)
    const writes = await consoleWrites(
      { config: { consoleFormat: 'text' }, preset: 'prod' },
      [get('/ok')]
    )

    expect(writes.map(write => write.replace(DURATION, '<duration>'))).toEqual([
      'info: 2026-01-02T03:04:05.678Z INFO  GET     /ok 200 <duration> '
    ])
  })

  test("'json' works without a preset", async () => {
    const record = await jsonRecord(
      { config: { consoleFormat: 'json' } },
      get('/ok')
    )

    expect(record.level).toBe('INFO')
    expect(record.status).toBe(200)
  })
})

describe.each([
  ['no preset', {}],
  ['preset dev', { preset: 'dev' }]
] as const)('%s keeps the text line', (_name, options: Options) => {
  test('byte for byte, timing aside', async () => {
    setSystemTime(NOW)
    const writes = await consoleWrites(options, [
      get('/ok'),
      get('/merged'),
      get('/checkout'),
      get('/multiline')
    ])

    expect(writes.map(write => write.replace(DURATION, '<duration>'))).toEqual([
      'info: 2026-01-02T03:04:05.678Z INFO  GET     /checkout 200 <duration> checkout started\n  └─ cartId  cart_1',
      'info: 2026-01-02T03:04:05.678Z INFO  GET     /merged 200 <duration> \n  ├─ cartId  cart_1\n  └─ items  3',
      'info: 2026-01-02T03:04:05.678Z INFO  GET     /multiline 200 <duration> line one\\nline two\n  └─ note  first\\nsecond',
      'info: 2026-01-02T03:04:05.678Z INFO  GET     /ok 200 <duration> '
    ])
  })
})
