import { describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { spyConsole } from '../_helpers/console'
import { sleep } from '../_helpers/sleep'

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u

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

describe('data keys named like the record', () => {
  test('the JSON line keeps the level it was logged at and the time it was written', async () => {
    const { line } = await logDataNamedLikeTheRecord()

    expect(line?.level).toBe('INFO')
    expect(line?.timestamp).toMatch(ISO_TIMESTAMP)
  })
})
