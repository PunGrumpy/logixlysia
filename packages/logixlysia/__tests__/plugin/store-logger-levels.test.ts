import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { Options } from '../../src/interfaces'

const createCaptureTransport = () => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {}
  )
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }]
    }
  }
  return { options, transport }
}

const cases = [
  { expectedLevel: 'DEBUG', method: 'debug' },
  { expectedLevel: 'INFO', method: 'info' },
  { expectedLevel: 'WARNING', method: 'warn' },
  { expectedLevel: 'ERROR', method: 'error' }
] as const

type Method = (typeof cases)[number]['method']

const isMethod = (value: string): value is Method =>
  cases.some(({ method }) => method === value)

describe('store.logger level methods', () => {
  for (const { expectedLevel, method } of cases) {
    test(`${method} emits a ${expectedLevel} record`, async () => {
      const { options, transport } = createCaptureTransport()
      const app = new Elysia()
        .use(logixlysia(options))
        .get('/log/:level', ({ params, request, store }) => {
          if (!isMethod(params.level)) {
            throw new Error(`unknown level ${params.level}`)
          }
          store.logger[params.level](request, `custom ${params.level}`)
          return 'ok'
        })

      await app.handle(new Request(`http://localhost/log/${method}`))

      expect(transport).toHaveBeenCalledTimes(1)
      const [level, message] = transport.mock.calls[0] ?? [undefined, undefined]
      expect(level).toBe(expectedLevel)
      expect(message).toBe(`custom ${method}`)
    })
  }
})
