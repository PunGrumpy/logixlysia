import { expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { HttpError, logixlysia } from '../../src'
import type { Options } from '../../src'
import { spyConsole } from '../_helpers/console'

type Spies = ReturnType<typeof spyConsole>['spies']

const AT_LINE = /error\.at\s+\S*__tests__\/plugin\/error-at\.test\.ts:\d+:\d+/u

const consoleText = (spies: Spies): string =>
  Object.values(spies)
    .flatMap(spy => spy.mock.calls.map(call => String(call[0])))
    .join('\n')

const config: NonNullable<Options['config']> = {
  disableFileLogging: true,
  useColors: false
}

test('a server error prints where it was thrown under the tree', async () => {
  const { restore, spies } = spyConsole(['error', 'warn', 'info'])
  try {
    const app = new Elysia().use(logixlysia({ config })).get('/boom', () => {
      throw new Error('db exploded')
    })

    const res = await app.handle(new Request('http://localhost/boom'))

    expect(res.status).toBe(500)
    expect(consoleText(spies)).toMatch(AT_LINE)
  } finally {
    restore()
  }
})

test('a 4xx HttpError carries no stack, so the tree has no error.at', async () => {
  const { restore, spies } = spyConsole(['error', 'warn', 'info'])
  try {
    const app = new Elysia().use(logixlysia({ config })).get('/missing', () => {
      throw new HttpError(404, 'nope')
    })

    const res = await app.handle(new Request('http://localhost/missing'))

    expect(res.status).toBe(404)
    expect(consoleText(spies)).toContain('nope')
    expect(consoleText(spies)).not.toContain('error.at')
  } finally {
    restore()
  }
})

test('a transport still receives the full stack', async () => {
  const { restore } = spyConsole(['error', 'warn', 'info'])
  try {
    const log = mock(
      (_level: string, _message: string, _meta?: Record<string, unknown>) => {}
    )
    const app = new Elysia()
      .use(
        logixlysia({
          config: { ...config, transports: [{ log }] }
        })
      )
      .get('/boom', () => {
        throw new Error('db exploded')
      })

    await app.handle(new Request('http://localhost/boom'))

    const meta = log.mock.calls.find(call => call[0] === 'ERROR')?.[2] as
      | { error?: { stack?: unknown } }
      | undefined
    expect(typeof meta?.error?.stack).toBe('string')
    expect(meta?.error?.stack).toContain('error-at.test.ts')
  } finally {
    restore()
  }
})
