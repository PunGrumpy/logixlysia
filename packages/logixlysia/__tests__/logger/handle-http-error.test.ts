import { describe, expect, mock, test } from 'bun:test'
import { Elysia, t } from 'elysia'

import logixlysia from '../../src'
import { HttpError, type Options } from '../../src/interfaces'
import { normalizeLoggedError } from '../../src/utils/error'
import { spyConsole } from '../_helpers/console'

interface CapturedEvent {
  level: unknown
  message: unknown
  meta: Record<string, unknown>
}

const VALIDATION_FAILED_BODY_REGEX = /^Validation failed \(body\)/

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
  new Elysia().use(logixlysia(options)).post(
    '/login',
    {
      body: t.Object({
        email: t.String(),
        password: t.String({ minLength: 60 })
      })
    },
    () => 'ok'
  )

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

  // Elysia route handlers may only throw Error instances (enforced by lint),
  // but `onError` can still receive a plain object thrown elsewhere (e.g. by
  // third-party code). Exercise that branch directly against
  // `normalizeLoggedError` rather than through a full request.
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

  // Class names (and thus `.name`/`.constructor.name`) are mangled under
  // bundler minification (e.g. `bun build --minify`, esbuild). Elysia's
  // `code === 'VALIDATION'` is the minification-safe discriminant; simulate
  // a mangled class to prove detection still works.
  test('detects a validation error by code when class names are minified', () => {
    class MangledClassName extends Error {}
    const mangled = Object.assign(
      new MangledClassName('{"found":{"password":"leak-me"}}'),
      {
        all: [{ path: '/password' }],
        code: 'VALIDATION',
        type: 'body'
      }
    )

    const { error: metaError, message } = normalizeLoggedError(mangled, false)

    expect(message).toBe('Validation failed (body): /password')
    expect(metaError.name).toBe('ValidationError')
    expect(JSON.stringify(metaError)).not.toContain('leak-me')
    expect(message).not.toContain('leak-me')
  })

  // Pins decided drift #2 from plans/017: the error path now honors the same
  // sink gates as the success path, so `useTransportsOnly` with zero
  // transports configured is "effectively disabled" end to end — no
  // transport call (none configured) and no console output either.
  test('useTransportsOnly with no transports configured emits nothing at all', async () => {
    const { spies, restore } = spyConsole()
    try {
      const app = new Elysia()
        .use(logixlysia({ config: { useTransportsOnly: true } }))
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

  // Pins decided drift #3 from plans/017: console output is chosen by level
  // on both paths now, so a 4xx (WARNING) error prints via console.warn
  // instead of the previously hardcoded console.error.
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
