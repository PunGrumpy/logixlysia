import { describe, expect, mock, test } from 'bun:test'
import { Elysia, t } from 'elysia'
import { logixlysia } from '../../src'
import { normalizeLoggedError } from '../../src/utils/error'

const body = { email: 'a@b.co', password: 'hunter2' }

// Elysia 1.x: a JSON Pointer per failure in `all`, the payload in the message.
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
    const { error } = normalizeLoggedError(elysia2Error(), true)

    expect(error.found).toEqual(body)
    expect(error.errors).toEqual([
      { instancePath: '/user/a.b', message: 'too short' }
    ])
  })

  test('adds nothing to an Elysia 1.x error, whose message has the payload', () => {
    const { error } = normalizeLoggedError(elysia1Error(), true)

    expect(error.message).toContain('hunter2')
    expect('found' in error).toBe(false)
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
