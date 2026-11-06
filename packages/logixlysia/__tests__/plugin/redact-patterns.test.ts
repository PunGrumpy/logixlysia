import { expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'

test('redactPatterns masks a custom shape and still delivers the record', async () => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {}
  )
  const app = new Elysia()
    .use(
      logixlysia({
        config: {
          autoRedact: true,
          disableFileLogging: true,
          disableInternalLogger: true,
          redactPatterns: [/cust_[a-z0-9]+/u],
          transports: [{ log: transport }]
        }
      })
    )
    .get('/', ({ request, store }) => {
      store.logger.info(request, 'order for cust_abc123')
      return 'ok'
    })

  await app.handle(new Request('http://localhost/'))

  expect(transport).toHaveBeenCalledTimes(1)
  const [level, message] = transport.mock.calls[0] ?? [undefined, undefined]
  expect(level).toBe('INFO')
  expect(message).toBe('order for [REDACTED]')
})
