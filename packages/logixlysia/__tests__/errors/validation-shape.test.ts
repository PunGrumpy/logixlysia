import { describe, expect, mock, test } from 'bun:test'
import { Elysia, t } from 'elysia'
import { logixlysia } from '../../src'
import { normalizeLoggedError } from '../../src/utils/error'
import { isSensitiveKey } from '../../src/utils/redact'

const body = { email: 'a@b.co', password: 'hunter2' }

// Elysia 1.x: a JSON Pointer per failure in `all`, the payload also in the message.
const elysia1Error = (): Error =>
  Object.assign(new Error(JSON.stringify({ found: body })), {
    all: [{ message: 'too short', path: '/password' }],
    code: 'VALIDATION',
    name: 'ValidationError',
    type: 'body',
    value: body
  })

// Elysia 2: a dotted path in `all`, the pointer on `errors`, the payload only
// on the error.
const elysia2Error = (): Error =>
  Object.assign(new Error('must not have fewer than 60 characters'), {
    all: [{ message: 'too short', path: 'user.a.b' }],
    code: 'validation',
    errors: [{ instancePath: '/user/a.b', message: 'too short' }],
    name: 'ValidationError',
    type: 'body',
    value: body
  })

// Elysia 2 with a Standard Schema validator: each issue's location is an
// array of keys, with no `instancePath`.
const standardSchemaError = (): Error =>
  Object.assign(new Error('email required'), {
    all: [{ message: 'email required', path: 'user.email' }],
    code: 'validation',
    errors: [
      { message: 'email required', path: ['user', { key: 'email' }] },
      { message: 'odd keys', path: ['a/b', 'c~d', 0] }
    ],
    name: 'ValidationError',
    type: 'body',
    value: body
  })

describe('a validation error on either Elysia line', () => {
  test('reports the failed values as JSON Pointers', () => {
    expect(
      normalizeLoggedError(elysia1Error(), false).error.failedPaths
    ).toEqual(['/password'])
    expect(
      normalizeLoggedError(elysia2Error(), false).error.failedPaths
    ).toEqual(['/user/a.b'])
  })

  test('turns a Standard Schema issue path into a JSON Pointer', () => {
    expect(
      normalizeLoggedError(standardSchemaError(), false).error.failedPaths
    ).toEqual(['/user/email', '/a~1b/c~0d/0'])
  })

  test('recognises an Elysia 2 error by its code once a bundler renamed it', () => {
    const minified = Object.assign(elysia2Error(), { name: 'e' })
    Object.setPrototypeOf(minified, Object.create(Error.prototype))

    const { error } = normalizeLoggedError(minified, false)

    expect(error.name).toBe('ValidationError')
    expect(error.failedPaths).toEqual(['/user/a.b'])
  })

  test('logs the payload Elysia 2 keeps off the message when it is wanted', () => {
    const { error, message } = normalizeLoggedError(elysia2Error(), true)

    expect(message).toBe('Validation failed (body): /user/a.b')
    expect(error.found).toEqual(body)
    expect(error.errors).toEqual([{ message: 'too short', path: '/user/a.b' }])
  })

  test('logs an Elysia 1.x payload as fields, never inside the message', () => {
    const { error, message } = normalizeLoggedError(elysia1Error(), true)

    expect(message).toBe('Validation failed (body): /password')
    expect(error).toEqual({
      errors: [{ message: 'too short', path: '/password' }],
      failedPaths: ['/password'],
      found: body,
      message: 'Validation failed (body): /password',
      name: 'ValidationError',
      type: 'body'
    })
  })

  test('keeps only the path and message of each failure', () => {
    const elysia1 = Object.assign(elysia1Error(), {
      all: [
        {
          message: 'Expected string',
          path: '/pin',
          summary: "Expected property 'pin' to be string but found: 4111111",
          value: 4_111_111
        }
      ]
    })
    const standard = Object.assign(standardSchemaError(), {
      errors: [
        {
          input: 'hunter2',
          message: 'email required',
          path: ['user', { key: 'email' }]
        }
      ]
    })

    expect(normalizeLoggedError(elysia1, true).error.errors).toEqual([
      { message: 'Expected string', path: '/pin' }
    ])
    expect(normalizeLoggedError(standard, true).error.errors).toEqual([
      { message: 'email required', path: '/user/email' }
    ])
  })
})

const QUOTED_SECRET = 'not-a-real-password'

// A validator that quotes the failed value in its own message, as some
// Standard Schema validators and a schema's custom `error` text do.
const quotingError = (paths: string[]): Error =>
  Object.assign(new Error('invalid'), {
    all: paths.map(path => ({
      message: `got "${QUOTED_SECRET}"`,
      path
    })),
    code: 'VALIDATION',
    name: 'ValidationError',
    type: 'body',
    value: { password: QUOTED_SECRET }
  })

const QUOTING_PATHS = [
  '/password',
  '/user/password',
  'user.password',
  '/vaultKey',
  '/email'
]
const QUOTED_MESSAGE = `got "${QUOTED_SECRET}"`
const isSensitivePathKey = (key: string): boolean =>
  isSensitiveKey(key, ['vaultKey'])

describe('a failure message that quotes the submitted value', () => {
  test('is masked when its path names a sensitive key and autoRedact is on', () => {
    const { error } = normalizeLoggedError(
      quotingError(QUOTING_PATHS),
      true,
      isSensitivePathKey
    )

    expect(error.errors).toEqual([
      { message: '[REDACTED]', path: '/password' },
      { message: '[REDACTED]', path: '/user/password' },
      { message: '[REDACTED]', path: 'user.password' },
      { message: '[REDACTED]', path: '/vaultKey' },
      { message: QUOTED_MESSAGE, path: '/email' }
    ])
  })

  test('is kept as it is when autoRedact is off', () => {
    const { error } = normalizeLoggedError(quotingError(QUOTING_PATHS), true)

    expect(error.errors).toEqual(
      QUOTING_PATHS.map(path => ({ message: QUOTED_MESSAGE, path }))
    )
  })

  test('is masked in the cause of another error as well', () => {
    const wrapper = new Error('save failed', {
      cause: quotingError(['/password'])
    })

    const { error } = normalizeLoggedError(wrapper, true, isSensitivePathKey)

    expect(error.cause).toMatchObject({
      errors: [{ message: '[REDACTED]', path: '/password' }]
    })
  })

  test('is masked for a Standard Schema issue whose path is an array of keys', () => {
    const { error } = normalizeLoggedError(
      Object.assign(standardSchemaError(), {
        errors: [
          { message: QUOTED_MESSAGE, path: ['user', { key: 'password' }] }
        ]
      }),
      true,
      isSensitivePathKey
    )

    expect(error.errors).toEqual([
      { message: '[REDACTED]', path: '/user/password' }
    ])
  })
})

const countingError = (): { error: Error; reads: () => number } => {
  let reads = 0
  const error = Object.assign(new Error('invalid'), {
    code: 'VALIDATION',
    name: 'ValidationError',
    type: 'body',
    value: body
  })
  Object.defineProperty(error, 'all', {
    get: () => {
      reads += 1
      return [{ message: 'too short', path: '/password' }]
    }
  })
  return { error, reads: () => reads }
}

const throwingAll = (): Error => {
  const error = Object.assign(new Error('invalid'), {
    code: 'VALIDATION',
    name: 'ValidationError',
    type: 'body',
    value: body
  })
  Object.defineProperty(error, 'all', {
    get: () => {
      throw new Error('validator re-entered')
    }
  })
  return error
}

describe('reading the failures of a validation error', () => {
  test('runs the validator at most once', () => {
    for (const logErrorPayload of [true, false]) {
      const { error, reads } = countingError()

      const logged = normalizeLoggedError(error, logErrorPayload).error

      expect(logged.failedPaths).toEqual(['/password'])
      expect(reads()).toBeLessThanOrEqual(1)
    }
  })

  test('still logs the summary when the validator throws, with the payload wanted', () => {
    expect(normalizeLoggedError(throwingAll(), true)).toEqual({
      error: {
        errors: [],
        failedPaths: [],
        found: body,
        message: 'Validation failed (body)',
        name: 'ValidationError',
        type: 'body'
      },
      message: 'Validation failed (body)'
    })
  })

  test('still logs the summary when the validator throws, with the payload not wanted', () => {
    expect(normalizeLoggedError(throwingAll(), false)).toEqual({
      error: {
        failedPaths: [],
        message: 'Validation failed (body)',
        name: 'ValidationError',
        type: 'body'
      },
      message: 'Validation failed (body)'
    })
  })

  test('still logs the summary when a failure has a getter that throws', () => {
    const failure = {
      get message(): string {
        throw new Error('no message')
      },
      get path(): string {
        throw new Error('no path')
      }
    }
    const error = Object.assign(elysia1Error(), { all: [failure] })

    expect(normalizeLoggedError(error, true).error).toEqual({
      errors: [],
      failedPaths: [],
      found: body,
      message: 'Validation failed (body)',
      name: 'ValidationError',
      type: 'body'
    })
  })

  test('still logs the summary when the submitted value cannot be read', () => {
    const error = elysia1Error()
    Object.defineProperty(error, 'value', {
      get: () => {
        throw new Error('no value')
      }
    })

    expect(normalizeLoggedError(error, true).error).toEqual({
      errors: [{ message: 'too short', path: '/password' }],
      failedPaths: ['/password'],
      found: undefined,
      message: 'Validation failed (body): /password',
      name: 'ValidationError',
      type: 'body'
    })
  })

  test('does not read a failure message when the payload is not wanted', () => {
    const failure = {
      get message(): string {
        throw new Error('no message')
      },
      path: '/password'
    }
    const error = Object.assign(elysia1Error(), { all: [failure] })

    expect(normalizeLoggedError(error, false)).toEqual({
      error: {
        failedPaths: ['/password'],
        message: 'Validation failed (body): /password',
        name: 'ValidationError',
        type: 'body'
      },
      message: 'Validation failed (body): /password'
    })
  })
})

describe('an error coded validation', () => {
  test("keeps the message of an app error that is not Elysia's", async () => {
    const transport = mock(
      (_level: unknown, _message: unknown, _meta?: unknown) => {}
    )
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
      .get('/signup', () => {
        throw Object.assign(new Error('email already taken'), {
          code: 'validation',
          status: 409
        })
      })

    await app.handle(new Request('http://localhost/signup'))

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[1]).toBe('email already taken')
  })

  test("recognises Elysia's own once a bundler renamed it", async () => {
    let thrown: unknown
    const app = new Elysia()
      .onError(({ error }) => {
        thrown = error
      })
      .guard({ body: t.Object({ email: t.String() }) }, guarded =>
        guarded.post('/signup', () => 'ok')
      )

    await app.handle(
      new Request('http://localhost/signup', {
        body: JSON.stringify({ email: 1 }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )
    // A minifier renames the class; its getters stay on the prototype.
    const minified = Object.defineProperties(thrown as Error, {
      constructor: { value: { name: 'e' } },
      name: { value: 'e' }
    })

    const { error } = normalizeLoggedError(minified, false)

    expect(error.name).toBe('ValidationError')
    expect(error.failedPaths).toEqual(['/email'])
  })
})
