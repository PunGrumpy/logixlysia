import { describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { HttpError, logixlysia } from '../../src'
import type { Options } from '../../src'
import { createMemoryTransport } from '../../src/testing'
import type { MemoryTransport } from '../../src/testing'

type Config = NonNullable<Options['config']>

const SECRET_EMAIL = 'ada.lovelace@example.com'

const buildApp = (memory: MemoryTransport, config: Config = {}) =>
  new Elysia()
    .use(
      logixlysia({
        config: {
          showStartupMessage: false,
          ...config,
          transports: [memory],
          useTransportsOnly: true
        }
      })
    )
    .get('/orders/:id', ({ log, params }) => {
      log.info('order loaded', { orderId: params.id })
      return { id: params.id }
    })
    .get('/pay', () => {
      throw new HttpError(402, 'Card declined', {
        code: 'PAYMENT_DECLINED',
        fix: 'Try a different card.',
        internal: { gatewayCode: 'do_not_honor' },
        why: 'The issuing bank rejected the charge.'
      })
    })
    .get('/health', () => 'ok')

interface Handler {
  handle: (request: Request) => Response | Promise<Response>
}

const get = (app: Handler, path: string, init?: RequestInit) =>
  app.handle(new Request(`http://localhost${path}`, init))

describe('createMemoryTransport', () => {
  test('captures the access line as one typed record', async () => {
    const memory = createMemoryTransport()
    const app = buildApp(memory)

    await get(app, '/orders/42?token=abc')

    const record = memory.last()
    expect(record).toMatchObject({
      level: 'INFO',
      message: '',
      method: 'GET',
      path: '/orders/42',
      status: 200
    })
    expect(typeof record?.durationMs).toBe('number')
    expect(record?.timestamp).toBeInstanceOf(Date)
    expect(record?.error).toBeUndefined()
  })

  test('captures a handler log line with its context', async () => {
    const memory = createMemoryTransport()
    const app = buildApp(memory)

    await get(app, '/orders/42')

    const line = memory.find(record => record.message === 'order loaded')
    expect(line?.level).toBe('INFO')
    expect(line?.path).toBe('/orders/42')
    expect(line?.context).toMatchObject({ orderId: '42' })
    expect(memory.records).toHaveLength(2)
  })

  test('exposes the request id from the context', async () => {
    const memory = createMemoryTransport()
    const app = buildApp(memory, { requestId: true })

    await get(app, '/health', { headers: { 'x-request-id': 'req-123' } })

    expect(memory.last()?.requestId).toBe('req-123')
    expect(memory.last()?.context.requestId).toBe('req-123')
  })

  test('captures an HttpError with its code, why and fix', async () => {
    const memory = createMemoryTransport()
    const app = buildApp(memory)

    const response = await get(app, '/pay')

    expect(response.status).toBe(402)
    const failure = memory.find(record => record.error !== undefined)
    expect(failure).toMatchObject({
      level: 'WARNING',
      message: 'Card declined',
      path: '/pay',
      status: 402
    })
    expect(failure?.error).toMatchObject({
      code: 'PAYMENT_DECLINED',
      fix: 'Try a different card.',
      internal: { gatewayCode: 'do_not_honor' },
      message: 'Card declined',
      name: 'HttpError',
      why: 'The issuing bank rejected the charge.'
    })
  })

  test('logs a server error at ERROR', async () => {
    const memory = createMemoryTransport()
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            showStartupMessage: false,
            transports: [memory],
            useTransportsOnly: true
          }
        })
      )
      .get('/boom', () => {
        throw new HttpError(500, 'Exploded', { code: 'BOOM' })
      })

    await get(app, '/boom')

    expect(memory.find(record => record.level === 'ERROR')?.error?.code).toBe(
      'BOOM'
    )
  })

  test('keeps an autoRedact secret out of every record', async () => {
    const memory = createMemoryTransport()
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            autoRedact: true,
            showStartupMessage: false,
            transports: [memory],
            useTransportsOnly: true
          }
        })
      )
      .get('/signup', ({ log }) => {
        log.info(`welcome ${SECRET_EMAIL}`, {
          email: SECRET_EMAIL,
          password: 'hunter2'
        })
        return 'ok'
      })

    await get(app, '/signup?email=ada&access_token=sekret', {
      headers: { authorization: 'Bearer sekret' }
    })

    expect(memory.records.length).toBeGreaterThan(0)
    const serialized = JSON.stringify(memory.records)
    expect(serialized).toContain('[REDACTED]')
    expect(serialized).not.toContain(SECRET_EMAIL)
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('sekret')
  })

  test('writes nothing for a request that logFilter.exclude hides', async () => {
    const memory = createMemoryTransport()
    const app = buildApp(memory, { logFilter: { exclude: ['/health'] } })

    await get(app, '/health')
    expect(memory.records).toHaveLength(0)

    await get(app, '/orders/1')
    expect(memory.records.length).toBeGreaterThan(0)
  })

  test('writes nothing for a request outside logFilter.include', async () => {
    const memory = createMemoryTransport()
    const app = buildApp(memory, { logFilter: { include: ['/orders/**'] } })

    await get(app, '/health')
    await get(app, '/pay')

    expect(memory.records).toHaveLength(0)
  })

  test('keeps only the newest maxRecords records', () => {
    const memory = createMemoryTransport({ maxRecords: 3 })

    for (const number of [1, 2, 3, 4, 5]) {
      memory.log('INFO', `line ${number}`)
    }

    expect(memory.records.map(record => record.message)).toEqual([
      'line 3',
      'line 4',
      'line 5'
    ])
  })

  test('rejects a maxRecords that is not a positive integer', () => {
    for (const maxRecords of [0, -1, 1.5, Number.NaN]) {
      expect(() => createMemoryTransport({ maxRecords })).toThrow(
        'maxRecords must be a positive integer'
      )
    }
  })

  test('filter, find, last and clear work on the kept records', () => {
    const memory = createMemoryTransport()
    expect(memory.last()).toBeUndefined()

    memory.log('INFO', 'a')
    memory.log('ERROR', 'b')
    memory.log('INFO', 'c')

    expect(memory.filter(record => record.level === 'INFO')).toHaveLength(2)
    expect(memory.find(record => record.level === 'ERROR')?.message).toBe('b')
    expect(memory.last()?.message).toBe('c')

    memory.clear()
    expect(memory.records).toHaveLength(0)
    expect(memory.last()).toBeUndefined()
  })

  test('records is a copy that later logs and clears do not change', () => {
    const memory = createMemoryTransport()
    memory.log('INFO', 'first')
    const before = memory.records

    memory.log('INFO', 'second')
    memory.clear()

    expect(before.map(record => record.message)).toEqual(['first'])
  })

  test('a stored record does not change when the request context does', async () => {
    const memory = createMemoryTransport()
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            showStartupMessage: false,
            transports: [memory],
            useTransportsOnly: true
          }
        })
      )
      .get('/mutate', ({ log }) => {
        const shared = { items: ['a'] }
        log.info('before', shared)
        shared.items.push('b')
        log.mergeContext({ late: true })
        return 'ok'
      })

    await get(app, '/mutate')

    const before = memory.find(record => record.message === 'before')
    expect(before?.context).toEqual({ items: ['a'] })
    expect(memory.last()?.context).toMatchObject({ late: true })
  })

  test('a record is a snapshot of what the transport was given', () => {
    const memory = createMemoryTransport()
    const meta = { context: { nested: { count: 1 } }, status: 200 }

    memory.log('INFO', 'snap', meta)
    meta.context.nested.count = 2
    meta.status = 500

    expect(memory.last()?.context).toEqual({ nested: { count: 1 } })
    expect(memory.last()?.status).toBe(200)
  })

  test('a record without request details leaves those fields undefined', () => {
    const memory = createMemoryTransport()

    memory.log('DEBUG', 'bare')

    expect(memory.last()).toMatchObject({
      context: {},
      durationMs: undefined,
      error: undefined,
      level: 'DEBUG',
      message: 'bare',
      method: undefined,
      path: undefined,
      requestId: undefined,
      status: undefined
    })
  })
})

describe('MemoryTransport.waitFor', () => {
  test('resolves with a record that is already kept', async () => {
    const memory = createMemoryTransport()
    memory.log('INFO', 'ready')

    const record = await memory.waitFor(item => item.message === 'ready')

    expect(record.message).toBe('ready')
  })

  test('resolves when a matching record arrives later', async () => {
    const memory = createMemoryTransport()
    const app = buildApp(memory)

    const pending = memory.waitFor(record => record.message === 'order loaded')
    await get(app, '/orders/7')

    const record = await pending
    expect(record.context).toMatchObject({ orderId: '7' })
  })

  test('rejects after the timeout and lists what it saw', async () => {
    const memory = createMemoryTransport()
    memory.log('INFO', 'hello', {
      request: { method: 'GET', url: 'http://localhost/a?x=1' },
      status: 200
    })
    memory.log('ERROR', 'bad')

    const outcome = await memory
      .waitFor(record => record.message === 'missing', { timeoutMs: 20 })
      .then(
        () => 'resolved',
        (error: Error) => error.message
      )

    expect(outcome).toContain('no record matched within 20ms')
    expect(outcome).toContain('2 records seen')
    expect(outcome).toContain('INFO GET /a 200 "hello"')
    expect(outcome).toContain('ERROR "bad"')
  })

  test('says so when nothing was logged', async () => {
    const memory = createMemoryTransport()

    const outcome = await memory
      .waitFor(() => true, { timeoutMs: 10 })
      .then(
        () => 'resolved',
        (error: Error) => error.message
      )

    expect(outcome).toContain('no records were logged')
  })

  test('names only the newest records of a long list', async () => {
    const memory = createMemoryTransport()
    for (let number = 1; number <= 15; number += 1) {
      memory.log('INFO', `line ${number}`)
    }

    const outcome = await memory
      .waitFor(() => false, { timeoutMs: 10 })
      .then(
        () => 'resolved',
        (error: Error) => error.message
      )

    expect(outcome).toContain('15 records seen (last 10 shown)')
    expect(outcome).toContain('"line 15"')
    expect(outcome).not.toContain('"line 5"')
  })

  test('rejects with the error a predicate throws', async () => {
    const memory = createMemoryTransport()
    const pending = memory.waitFor(
      () => {
        throw new Error('predicate failed')
      },
      { timeoutMs: 1000 }
    )

    memory.log('INFO', 'trigger')

    await expect(pending).rejects.toThrow('predicate failed')
  })

  test('rejects an invalid timeout', async () => {
    const memory = createMemoryTransport()

    await expect(memory.waitFor(() => true, { timeoutMs: -1 })).rejects.toThrow(
      'timeoutMs must be from 0'
    )
  })
})
