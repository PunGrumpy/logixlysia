import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Elysia } from 'elysia'
import { flushLogixlysia, HttpError, logixlysia } from '../../src'
import type { Options } from '../../src/interfaces'
import { normalizeLoggedError } from '../../src/utils/error'
import { spyConsole } from '../_helpers/console'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const STACK_FRAME_REGEX = /\n\s+at /u
const EMAIL = 'jane.doe@example.com'

interface CapturedMeta {
  error?: Record<string, unknown>
}

const captureApp = (
  route: () => never,
  config: Record<string, unknown> = {}
) => {
  const metas: CapturedMeta[] = []
  const app = new Elysia()
    .use(
      logixlysia({
        config: {
          ...config,
          disableFileLogging: true,
          disableInternalLogger: true,
          transports: [
            {
              log: (_level, _message, meta) => {
                metas.push((meta ?? {}) as CapturedMeta)
              }
            }
          ]
        }
      })
    )
    .get('/boom', route)
  return { app, metas }
}

const errorMeta = (
  metas: CapturedMeta[]
): Record<string, unknown> | undefined => metas.find(meta => meta.error)?.error

describe('error stack on transports', () => {
  test('a plain error carries its stack', () => {
    const { error } = normalizeLoggedError(new Error('x'), false)

    expect(typeof error.stack).toBe('string')
    expect(error.stack).toContain('error-stack.test')
  })

  test('a 5xx or unknown-status error has a stack, a 4xx does not', () => {
    const server = normalizeLoggedError(new HttpError(500, 'x'), false).error
    const client = normalizeLoggedError(new HttpError(404, 'x'), false).error
    const weird = normalizeLoggedError(
      Object.assign(new Error('x'), { status: 'weird' }),
      false
    ).error

    expect(typeof server.stack).toBe('string')
    expect(client).not.toHaveProperty('stack')
    expect(typeof weird.stack).toBe('string')
  })

  test('a cause carries its own stack', () => {
    const { error } = normalizeLoggedError(
      new Error('outer', { cause: new Error('inner') }),
      false
    )
    const cause = error.cause as Record<string, unknown>

    expect(typeof cause.stack).toBe('string')
    expect(cause.stack).not.toBe(error.stack)
  })

  test('a throwing route sends the stack to a transport', async () => {
    const { app, metas } = captureApp(() => {
      throw new Error('handler failed')
    })

    await app.handle(new Request('http://localhost/boom'))

    expect(typeof errorMeta(metas)?.stack).toBe('string')
  })

  test('a route throwing a 404 sends no stack', async () => {
    const { app, metas } = captureApp(() => {
      throw new HttpError(404, 'missing')
    })

    await app.handle(new Request('http://localhost/boom'))

    expect(errorMeta(metas)).toBeDefined()
    expect(errorMeta(metas)).not.toHaveProperty('stack')
  })

  test('the console never prints stack frames', async () => {
    const { spies, restore } = spyConsole()
    try {
      const app = new Elysia()
        .use(logixlysia({ config: { disableFileLogging: true } }))
        .get('/boom', () => {
          throw new Error('handler failed')
        })

      await app.handle(new Request('http://localhost/boom'))

      const written = [
        ...spies.error.mock.calls,
        ...spies.warn.mock.calls,
        ...spies.log.mock.calls,
        ...spies.info.mock.calls
      ]
        .flat()
        .join('\n')
      expect(written).toContain('handler failed')
      expect(written).not.toMatch(STACK_FRAME_REGEX)
    } finally {
      restore()
    }
  })

  test('autoRedact masks an email inside the stack', async () => {
    const { app, metas } = captureApp(
      () => {
        throw new Error(`no account for ${EMAIL}`)
      },
      { autoRedact: true }
    )

    await app.handle(new Request('http://localhost/boom'))

    const { stack } = errorMeta(metas) ?? {}
    expect(typeof stack).toBe('string')
    expect(stack).not.toContain(EMAIL)
  })

  test('the file log keeps an error on a single line', async () => {
    const dir = await createTempDir()
    try {
      const logFilePath = path.join(dir, 'logs', 'stack.log')
      const options: Options = {
        config: {
          disableInternalLogger: true,
          logFilePath,
          showStartupMessage: false
        }
      }
      const app = new Elysia().use(logixlysia(options)).get('/boom', () => {
        throw new Error('handler failed')
      })

      await app.handle(new Request('http://localhost/boom'))
      await flushLogixlysia(options, { close: true })

      const content = await readFile(logFilePath, 'utf-8')
      const lines = content.split('\n').filter(Boolean)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('handler failed')
      expect(lines[0]).not.toMatch(STACK_FRAME_REGEX)
    } finally {
      await removeTempDir(dir)
    }
  })
})
