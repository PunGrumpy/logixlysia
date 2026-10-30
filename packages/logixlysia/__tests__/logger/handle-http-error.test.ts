import { describe, expect, mock, test } from 'bun:test'
import { Elysia, t } from 'elysia'
import { logixlysia } from '../../src'
import { HttpError } from '../../src/interfaces'
import type { Options } from '../../src/interfaces'
import { normalizeLoggedError } from '../../src/utils/error'
import { spyConsole } from '../_helpers/console'

interface CapturedEvent {
  level: unknown
  message: unknown
  meta: Record<string, unknown>
}

const VALIDATION_FAILED_BODY_REGEX = /^Validation failed \(body\)/u

const createCaptureTransport = () => {
  const events: CapturedEvent[] = []
  const transport = mock(
    (level: unknown, message: unknown, meta?: Record<string, unknown>) => {
      events.push({ level, message, meta: meta ?? {} })
    }
  )
  return { events, transport }
}

const SECRET_PASSWORD = 'hunter2-secret-value'

const buildLoginApp = (options: Options) =>
  new Elysia().use(logixlysia(options)).post('/login', () => 'ok', {
    body: t.Object({
      email: t.String(),
      password: t.String({ minLength: 60 })
    })
  })

describe('handleHttpError', () => {
  test('does not leak the request body when a validation error occurs', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildLoginApp({
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }]
      }
    })

    const res = await app.handle(
      new Request('http://localhost/login', {
        body: JSON.stringify({ email: 'a@b.co', password: SECRET_PASSWORD }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(res.status).toBe(422)

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain(SECRET_PASSWORD)

    const errorEvent = events.find(
      event =>
        typeof event.message === 'string' &&
        event.message.startsWith('Validation failed')
    )
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.message).toMatch(VALIDATION_FAILED_BODY_REGEX)

    const metaError = errorEvent?.meta.error as Record<string, unknown>
    expect(metaError.name).toBe('ValidationError')
    expect(metaError.failedPaths).toContain('/password')
  })

  test('logs the full payload when logErrorPayload is enabled', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildLoginApp({
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        logErrorPayload: true,
        transports: [{ log: transport }]
      }
    })

    const res = await app.handle(
      new Request('http://localhost/login', {
        body: JSON.stringify({ email: 'a@b.co', password: SECRET_PASSWORD }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(res.status).toBe(422)

    const serialized = JSON.stringify(events)
    expect(serialized).toContain(SECRET_PASSWORD)
  })

  test('normalizes a thrown HttpError into a serializable, minimal shape', async () => {
    const { events, transport } = createCaptureTransport()
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }]
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/down', () => {
      throw new HttpError(503, 'downstream')
    })

    await app.handle(new Request('http://localhost/down'))

    const errorEvent = events.find(event => event.meta.status === 503)
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.meta.error).toEqual({
      message: 'downstream',
      name: 'HttpError',
      status: 503
    })
    expect(() => JSON.stringify(errorEvent?.meta)).not.toThrow()
  })

  test('keeps the cause of a thrown error on the error line', async () => {
    const { events, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/save', () => {
        throw new Error('save failed', {
          cause: new Error('connection reset')
        })
      })

    await app.handle(new Request('http://localhost/save'))

    const metaError = events.find(event => event.meta.error)?.meta
      .error as Record<string, unknown>
    expect(metaError.message).toBe('save failed')
    expect(metaError.cause).toEqual({
      message: 'connection reset',
      name: 'Error'
    })
  })

  test('cuts a cause chain after three levels', async () => {
    const { events, transport } = createCaptureTransport()
    const chain = new Error('level 0', {
      cause: new Error('level 1', {
        cause: new Error('level 2', {
          cause: new Error('level 3', { cause: new Error('level 4') })
        })
      })
    })
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/chain', () => {
        throw chain
      })

    await app.handle(new Request('http://localhost/chain'))

    const metaError = events.find(event => event.meta.error)?.meta
      .error as Record<string, unknown>
    expect(metaError).toEqual({
      cause: {
        cause: {
          cause: { message: 'level 3', name: 'Error' },
          message: 'level 2',
          name: 'Error'
        },
        message: 'level 1',
        name: 'Error'
      },
      message: 'level 0',
      name: 'Error'
    })
  })

  test('keeps a primitive cause as it is', async () => {
    const { events, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/plain', () => {
        throw new Error('wrapped', { cause: 'plain string' })
      })

    await app.handle(new Request('http://localhost/plain'))

    const metaError = events.find(event => event.meta.error)?.meta
      .error as Record<string, unknown>
    expect(metaError.cause).toBe('plain string')
  })

  test('autoRedact applies to the cause', async () => {
    const { events, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            autoRedact: true,
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/leak', () => {
        throw new Error('wrapped', {
          cause: Object.assign(new Error('rejected'), {
            code: 'E_AUTH',
            internal: { password: SECRET_PASSWORD }
          })
        })
      })

    await app.handle(new Request('http://localhost/leak'))

    const serialized = JSON.stringify(events)
    expect(serialized).toContain('rejected')
    expect(serialized).not.toContain(SECRET_PASSWORD)
  })

  test('terminates on a circular cause', () => {
    const loop = new Error('loop')
    loop.cause = loop

    const { error } = normalizeLoggedError(loop, false)

    expect(JSON.stringify(error)).toContain('loop')
    expect(error.cause).toBeDefined()
  })

  test('preserves structured-error fields (why/fix) from a plain-object error', () => {
    const thrown = {
      fix: 'set the config value',
      message: 'bad config',
      why: 'config missing'
    }

    const { error: metaError } = normalizeLoggedError(thrown, false)

    expect(metaError.why).toBe('config missing')
    expect(metaError.fix).toBe('set the config value')
    expect(metaError.message).toBe('bad config')
  })

  test('detects a validation error by code when class names are minified', () => {
    class MangledError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'MangledError'
      }
    }
    const mangled = Object.assign(
      new MangledError('{"found":{"password":"leak-me"}}'),
      {
        all: [{ path: '/password' }],
        code: 'VALIDATION',
        type: 'body'
      }
    )
    expect(mangled.name).not.toBe('ValidationError')
    expect(mangled.constructor.name).not.toBe('ValidationError')

    const { error: metaError, message } = normalizeLoggedError(mangled, false)

    expect(message).toBe('Validation failed (body): /password')
    expect(metaError.name).toBe('ValidationError')
    expect(JSON.stringify(metaError)).not.toContain('leak-me')
    expect(message).not.toContain('leak-me')
  })

  test('an effectively disabled logger emits nothing on the error path', async () => {
    const { spies, restore } = spyConsole()
    try {
      const app = new Elysia()
        .use(
          logixlysia({
            config: { disableFileLogging: true, disableInternalLogger: true }
          })
        )
        .get('/down', () => {
          throw new HttpError(503, 'downstream')
        })

      const res = await app.handle(new Request('http://localhost/down'))

      expect(res.status).toBe(503)
      expect(spies.debug).not.toHaveBeenCalled()
      expect(spies.info).not.toHaveBeenCalled()
      expect(spies.warn).not.toHaveBeenCalled()
      expect(spies.error).not.toHaveBeenCalled()
      expect(spies.log).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  test('a 4xx error prints via console.warn, not console.error', async () => {
    const { spies, restore } = spyConsole()
    try {
      const app = new Elysia()
        .use(logixlysia({ config: { disableFileLogging: true } }))
        .get('/missing', () => {
          throw new HttpError(404, 'not found')
        })

      const res = await app.handle(new Request('http://localhost/missing'))

      expect(res.status).toBe(404)
      expect(spies.warn).toHaveBeenCalledTimes(1)
      expect(spies.error).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  test('a 5xx error still prints via console.error', async () => {
    const { spies, restore } = spyConsole()
    try {
      const app = new Elysia()
        .use(logixlysia({ config: { disableFileLogging: true } }))
        .get('/down', () => {
          throw new HttpError(503, 'downstream')
        })

      const res = await app.handle(new Request('http://localhost/down'))

      expect(res.status).toBe(503)
      expect(spies.error).toHaveBeenCalledTimes(1)
      expect(spies.warn).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})
