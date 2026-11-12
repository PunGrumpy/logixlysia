import { expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { Options } from '../../src'
import { buildContextTreeLines } from '../../src/logger/create-logger'
import { spyConsole } from '../_helpers/console'

type Spies = ReturnType<typeof spyConsole>['spies']

const consoleText = (spies: Spies): string =>
  Object.values(spies)
    .flatMap(spy => spy.mock.calls.map(call => String(call[0])))
    .join('\n')

const plain = { config: { useColors: false } }

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
    return consoleText(spies)
  } finally {
    restore()
  }
}

test('prints a two level cause chain under the error', async () => {
  const text = await printedFor(() => {
    throw new Error('order failed', {
      cause: new TypeError('db timeout', { cause: new Error('socket closed') })
    })
  })

  expect(text).toContain('Caused by: TypeError: db timeout')
  expect(text).toContain('Caused by: Error: socket closed')
  expect(text.indexOf('order failed')).toBeLessThan(
    text.indexOf('Caused by: TypeError: db timeout')
  )
  expect(text.indexOf('Caused by: TypeError: db timeout')).toBeLessThan(
    text.indexOf('Caused by: Error: socket closed')
  )
})

test('prints nothing extra for an error without a cause', async () => {
  const text = await printedFor(() => {
    throw new Error('plain failure')
  })

  expect(text).not.toContain('Caused by')
})

test('stops at a cause that loops back to an earlier error', () => {
  const first = new Error('first')
  const second = new Error('second', { cause: first })
  first.cause = second

  const lines = buildContextTreeLines('ERROR', { error: first }, plain)
  const caused = lines.filter(line => line.includes('Caused by'))

  expect(caused).toHaveLength(1)
  expect(caused[0]).toContain('Caused by: Error: second')
})

test('prints a string cause as its text', async () => {
  const text = await printedFor(() => {
    throw new Error('order failed', { cause: 'upstream said no' })
  })

  expect(text).toContain('Caused by: upstream said no')
})

test('prints an object cause as JSON', () => {
  const lines = buildContextTreeLines(
    'ERROR',
    { error: new Error('order failed', { cause: { code: 'E_DB', retry: 3 } }) },
    plain
  )

  expect(lines.join('\n')).toContain('Caused by: {"code":"E_DB","retry":3}')
})

test('shows at most three causes', async () => {
  const text = await printedFor(() => {
    throw new Error('top', {
      cause: new Error('c1', {
        cause: new Error('c2', {
          cause: new Error('c3', { cause: new Error('c4') })
        })
      })
    })
  })

  expect(text).toContain('Caused by: Error: c3')
  expect(text).not.toContain('c4')
})

test('redacts a secret in a cause message', async () => {
  const text = await printedFor(
    () => {
      throw new Error('order failed', {
        cause: new Error('rejected for ops@example.com')
      })
    },
    { autoRedact: true }
  )

  expect(text).toContain('Caused by: Error: rejected for [REDACTED]')
  expect(text).not.toContain('ops@example.com')
})

test('shows where a cause was thrown, like the top error', () => {
  const cause = new Error('db timeout')
  cause.stack = 'Error: db timeout\n    at query (/app/src/db.ts:3:5)'

  const text = buildContextTreeLines(
    'ERROR',
    { error: new Error('order failed', { cause }) },
    plain
  ).join('\n')

  expect(text).toContain('at /app/src/db.ts:3:5')
})
