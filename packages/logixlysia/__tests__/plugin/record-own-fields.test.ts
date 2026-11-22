import { describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { spyConsole } from '../_helpers/console'
import { sleep } from '../_helpers/sleep'

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const OWN_REQUEST = { method: 'GET', url: 'http://localhost/orders' }

const logDataNamedLikeTheRecord = async () => {
  const metas: Record<string, unknown>[] = []
  const { restore, spies } = spyConsole()
  try {
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            consoleFormat: 'json',
            transports: [
              {
                log: (_level, _message, meta) => {
                  metas.push(meta ?? {})
                }
              }
            ]
          }
        })
      )
      .get('/orders', ({ request, store }) => {
        store.logger.log(
          'INFO',
          request,
          {
            level: 'DEBUG',
            message: 'called upstream',
            request: {
              method: 'POST',
              url: 'https://api.example/charge?token=abc'
            },
            timestamp: 'yesterday'
          },
          { beforeTime: process.hrtime.bigint() }
        )
        return 'ok'
      })
    await app.handle(new Request('http://localhost/orders?session=s1'))
    await sleep(10)
  } finally {
    restore()
  }
  const lines = Object.values(spies).flatMap(spy =>
    spy.mock.calls.map(
      call => JSON.parse(String(call[0])) as Record<string, unknown>
    )
  )
  return {
    line: lines.find(line => line.message === 'called upstream'),
    meta: metas.find(meta => meta.message === 'called upstream')
  }
}

const rawLinesLoggedWithJsonFormat = async (
  data: Record<string, unknown>
): Promise<string[]> => {
  const { restore, spies } = spyConsole()
  try {
    const app = new Elysia()
      .use(logixlysia({ config: { consoleFormat: 'json' } }))
      .get('/orders', ({ request, store }) => {
        store.logger.log('INFO', request, data, {
          beforeTime: process.hrtime.bigint()
        })
        return 'ok'
      })
    await app.handle(new Request('http://localhost/orders'))
    await sleep(10)
  } finally {
    restore()
  }
  return Object.values(spies).flatMap(spy =>
    spy.mock.calls.map(call => String(call[0]))
  )
}

// The own `log` line is the one without a status: the access line always
// carries one.
const ownLines = (raw: string[]): Record<string, unknown>[] =>
  raw
    .map(line => JSON.parse(line) as Record<string, unknown>)
    .filter(line => line.status === undefined)

describe('data keys named like the record', () => {
  test("the JSON line's message stays a string when the data's message is an object", async () => {
    const lines = ownLines(
      await rawLinesLoggedWithJsonFormat({ message: { a: 1 } })
    )

    expect(lines).toHaveLength(1)
    expect(lines[0]?.message).toBe('')
  })

  test("the JSON line's message stays a string when the data's message is a number", async () => {
    const lines = ownLines(await rawLinesLoggedWithJsonFormat({ message: 42 }))

    expect(lines).toHaveLength(1)
    expect(lines[0]?.message).toBe('')
  })

  test("a string message in the data is the JSON line's message", async () => {
    const raw = await rawLinesLoggedWithJsonFormat({ message: 'hello' })

    const line = raw.find(candidate => candidate.includes('hello'))
    expect(JSON.parse(line ?? '{}').message).toBe('hello')
    expect(line?.split('hello')).toHaveLength(2)
  })

  test('the JSON line keeps the level it was logged at and the time it was written', async () => {
    const { line } = await logDataNamedLikeTheRecord()

    expect(line?.level).toBe('INFO')
    expect(line?.timestamp).toMatch(ISO_TIMESTAMP)
  })

  test('the JSON line keeps the request it belongs to', async () => {
    const { line } = await logDataNamedLikeTheRecord()

    expect(line?.request).toEqual(OWN_REQUEST)
  })

  test('a transport receives the request the record belongs to', async () => {
    const { meta } = await logDataNamedLikeTheRecord()

    expect(meta?.request).toEqual(OWN_REQUEST)
  })
})
