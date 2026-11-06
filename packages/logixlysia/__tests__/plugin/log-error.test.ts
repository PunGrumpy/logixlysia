import { expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { HttpError, logixlysia, useLogger } from '../../src'
import type { Options } from '../../src'

interface CapturedEvent {
  level: string
  message: string
  meta: {
    context?: Record<string, unknown>
    error?: Record<string, unknown>
    status?: number
  }
}

const build = (config: NonNullable<Options['config']> = {}) => {
  const events: CapturedEvent[] = []
  const transport = mock(
    (level: string, message: string, meta?: CapturedEvent['meta']) => {
      events.push({ level, message, meta: meta ?? {} })
    }
  )
  const logs = logixlysia({
    config: {
      ...config,
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }]
    }
  })
  return { events, logs }
}

test('a string message is logged as before, with no error object', async () => {
  const { events, logs } = build()
  const app = new Elysia().use(logs).get('/', ({ log }) => {
    log.error('plain')
    return 'ok'
  })

  await app.handle(new Request('http://localhost/'))

  expect(events).toHaveLength(1)
  expect(events[0]?.level).toBe('ERROR')
  expect(events[0]?.message).toBe('plain')
  expect(events[0]?.meta.error).toBeUndefined()
})

test('a caught Error gives its message, name, cause and the call context', async () => {
  const { events, logs } = build()
  const app = new Elysia().use(logs).get('/', ({ log }) => {
    try {
      throw new Error('db down', { cause: new Error('ECONNRESET') })
    } catch (err) {
      log.error(err, { step: 'pay' })
    }
    return 'ok'
  })

  await app.handle(new Request('http://localhost/'))

  const [line] = events
  expect(line?.level).toBe('ERROR')
  expect(line?.message).toBe('db down')
  expect(line?.meta.error).toMatchObject({
    cause: { message: 'ECONNRESET' },
    name: 'Error'
  })
  expect(line?.meta.context?.step).toBe('pay')
})

test('a caught HttpError keeps its structured fields', async () => {
  const { events, logs } = build()
  const app = new Elysia().use(logs).get('/', ({ log }) => {
    log.error(
      new HttpError(402, 'declined', {
        code: 'X',
        internal: { a: 1 },
        why: 'y'
      })
    )
    return 'ok'
  })

  await app.handle(new Request('http://localhost/'))

  expect(events[0]?.meta.error).toMatchObject({
    code: 'X',
    internal: { a: 1 },
    why: 'y'
  })
})

test('a recovered error writes one line and the response stays 200 with no status on it', async () => {
  const { events, logs } = build()
  const app = new Elysia().use(logs).get('/', ({ log }) => {
    try {
      throw new Error('flaky')
    } catch (err) {
      log.error(err)
    }
    return 'recovered'
  })

  const response = await app.handle(new Request('http://localhost/'))

  expect(response.status).toBe(200)
  expect(events).toHaveLength(1)
  expect(events[0]?.meta.status).toBeUndefined()
})

test('autoRedact masks an email in the message and in meta.error.message', async () => {
  const { events, logs } = build({ autoRedact: true })
  const app = new Elysia().use(logs).get('/', ({ log }) => {
    log.error(new Error('no account for jane@example.com'))
    return 'ok'
  })

  await app.handle(new Request('http://localhost/'))

  const [line] = events
  expect(line?.message).not.toContain('jane@example.com')
  expect(String(line?.meta.error?.message)).not.toContain('jane@example.com')
})

test('runJob and useLogger take a string and a caught error alike', async () => {
  const { events, logs } = build({ useAsyncLocalStorage: true })

  await logs.runJob('nightly', log => {
    log.error('x')
    log.error(new Error('y'))
    useLogger().error(new Error('z'))
  })

  const errors = events.filter(event => event.level === 'ERROR')
  expect(errors.map(event => event.message)).toEqual(['x', 'y', 'z'])
  expect(errors[0]?.meta.error).toBeUndefined()
  expect(errors[1]?.meta.error?.name).toBe('Error')
  expect(errors[2]?.meta.error?.name).toBe('Error')
})

test('a non-Error value does not throw and writes one line', async () => {
  const { events, logs } = build()
  const app = new Elysia().use(logs).get('/', ({ log }) => {
    log.error({ reason: 'x' })
    return 'ok'
  })

  const response = await app.handle(new Request('http://localhost/'))

  expect(response.status).toBe(200)
  expect(events).toHaveLength(1)
  expect(events[0]?.level).toBe('ERROR')
})
