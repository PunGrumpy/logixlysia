import { expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { Options } from '../../src'
import { spyConsole } from '../_helpers/console'

const printedFor = async (
  thrown: () => never,
  config: Options['config'] = {}
): Promise<string> => {
  const { restore, spies } = spyConsole(['error', 'warn', 'info'])
  try {
    const app = new Elysia()
      .use(
        logixlysia({
          config: { disableFileLogging: true, useColors: false, ...config }
        })
      )
      .get('/boom', thrown)
    await app.handle(new Request('http://localhost/boom'))
    return Object.values(spies)
      .flatMap(spy => spy.mock.calls.map(call => String(call[0])))
      .join('\n')
  } finally {
    restore()
  }
}

const countOf = (text: string, needle: string): number =>
  text.split(needle).length - 1

test('a failed request prints its error message once', async () => {
  const text = await printedFor(() => {
    throw new Error('Payment failed', { cause: new Error('socket closed') })
  })

  expect(countOf(text, 'Payment failed')).toBe(1)
  expect(text.split('\n')[0]).toEndWith(' Payment failed')
  expect(text).toContain('error.at  ')
  expect(text).toContain('Caused by: Error: socket closed')
})

test('a 404 prints NOT_FOUND once on the line and keeps error.code', async () => {
  const { restore, spies } = spyConsole(['warn'])
  try {
    const app = new Elysia().use(
      logixlysia({ config: { disableFileLogging: true, useColors: false } })
    )
    await app.handle(new Request('http://localhost/missing'))
    const text = String(spies.warn.mock.calls[0]?.[0])

    expect(text.split('\n')).toEqual([
      expect.stringMatching(/ 404 \S+ NOT_FOUND$/u),
      '  └─ error.code  NOT_FOUND'
    ])
  } finally {
    restore()
  }
})

test('a format without {message} keeps the error row in the tree', async () => {
  const text = await printedFor(
    () => {
      throw new Error('Payment failed')
    },
    { customLogFormat: '{method} {pathname} {status}' }
  )

  expect(text).toContain('  ├─ error  Payment failed')
})
