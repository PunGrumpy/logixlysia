import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { Options, SinkErrorContext } from '../../src/interfaces'

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

interface Meta {
  context?: { requestId?: unknown }
}

const clientRequest = (path: string) =>
  new Request(`http://localhost${path}`, {
    headers: { 'x-request-id': 'client-abc' }
  })

const capture = () => {
  const records: { message: unknown; meta: Meta | undefined }[] = []
  const transport = {
    log: (_level: unknown, message: unknown, meta?: unknown) => {
      records.push({ message, meta: meta as Meta | undefined })
    }
  }
  const config: Options['config'] = {
    disableFileLogging: true,
    disableInternalLogger: true,
    requestId: true,
    transports: [transport]
  }
  return { config, records }
}

describe('request ID plugin integration', () => {
  test('auto-merges requestId into log context', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: true,
        transports: [{ log: transport }]
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    await app.handle(new Request('http://localhost/test'))

    expect(transport).toHaveBeenCalledTimes(1)
    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined
    expect(meta?.context?.requestId).toBeDefined()
    expect(typeof meta?.context?.requestId).toBe('string')
    expect(meta?.context?.requestId).toMatch(UUID_V4_REGEX)
  })

  test('sets X-Request-Id response header', async () => {
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: true
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    const response = await app.handle(new Request('http://localhost/test'))

    const responseId = response.headers.get('X-Request-Id')
    expect(responseId).toBeDefined()
    expect(responseId).toMatch(UUID_V4_REGEX)
  })

  test('honors incoming X-Request-Id header', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: true,
        transports: [{ log: transport }]
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    const incomingId = 'gateway-req-abc-123'
    const response = await app.handle(
      new Request('http://localhost/test', {
        headers: { 'X-Request-Id': incomingId }
      })
    )

    expect(response.headers.get('X-Request-Id')).toBe(incomingId)

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined
    expect(meta?.context?.requestId).toBe(incomingId)
  })

  test('disabled by default — no requestId in context', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }]
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    const response = await app.handle(new Request('http://localhost/test'))

    expect(response.headers.get('X-Request-Id')).toBeNull()

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined
    expect(meta?.context?.requestId).toBeUndefined()
  })

  test('uses custom header name from RequestIdConfig', async () => {
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: { header: 'X-Correlation-Id' }
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    const response = await app.handle(new Request('http://localhost/test'))

    expect(response.headers.get('X-Correlation-Id')).toBeDefined()
    expect(response.headers.get('X-Request-Id')).toBeNull()
  })

  test('uses custom generator from RequestIdConfig', async () => {
    let counter = 0
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: {
          generator: () => {
            counter += 1
            return `custom-${counter}`
          }
        },
        transports: [
          {
            log: () => {}
          }
        ]
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    const res1 = await app.handle(new Request('http://localhost/test'))
    const res2 = await app.handle(new Request('http://localhost/test'))

    expect(res1.headers.get('X-Request-Id')).toBe('custom-1')
    expect(res2.headers.get('X-Request-Id')).toBe('custom-2')
  })

  test('falls back to a generated id when the generator throws', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})
    const onError = mock<(context: SinkErrorContext) => void>(() => {})
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        onError,
        requestId: {
          generator: () => {
            throw new Error('no span')
          }
        },
        transports: [{ log: transport }]
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    const response = await app.handle(new Request('http://localhost/test'))

    expect(response.status).toBe(200)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[0]).toBe('INFO')
    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string }; status?: number }
      | undefined
    expect(meta?.status).toBe(200)
    expect(meta?.context?.requestId).toMatch(UUID_V4_REGEX)
    expect(onError).toHaveBeenCalledTimes(1)
    const reported = onError.mock.calls[0]?.[0]
    expect(reported?.sink).toBe('enricher')
    expect((reported?.error as Error | undefined)?.message).toBe('no span')
  })

  test('replaces an invalid generated id', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})
    const onError = mock<(context: SinkErrorContext) => void>(() => {})
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        onError,
        requestId: { generator: () => 'bad id with spaces' },
        transports: [{ log: transport }]
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    const response = await app.handle(new Request('http://localhost/test'))

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined
    expect(meta?.context?.requestId).toMatch(UUID_V4_REGEX)
    expect(response.headers.get('X-Request-Id')).toMatch(UUID_V4_REGEX)
    expect(onError).toHaveBeenCalledTimes(1)
    const reported = onError.mock.calls[0]?.[0]
    expect(reported?.sink).toBe('enricher')
    expect((reported?.error as Error | undefined)?.message).toBe(
      'generated request id is not valid: bad id with spaces'
    )
  })

  test('{requestId} token works in customLogFormat', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})
    const options: Options = {
      config: {
        customLogFormat: '{method} {pathname} {requestId}',
        disableFileLogging: true,
        requestId: { generator: () => 'test-req-id-789' },
        transports: [{ log: transport }]
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    await app.handle(new Request('http://localhost/test'))

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined
    expect(meta?.context?.requestId).toBe('test-req-id-789')
  })

  test('prod preset enables requestId by default', async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {})
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }]
      },
      preset: 'prod'
    }

    const app = new Elysia().use(logixlysia(options)).get('/test', () => 'ok')

    await app.handle(new Request('http://localhost/test'))

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined
    expect(meta?.context?.requestId).toBeDefined()
    expect(typeof meta?.context?.requestId).toBe('string')
  })

  test('generates its own id over a value an earlier app hook set on the response', async () => {
    const { config, records } = capture()
    const app = new Elysia()
      .onRequest(({ set }) => {
        set.headers['x-request-id'] = 'from-app'
      })
      .use(
        logixlysia({
          config: {
            ...config,
            requestId: {
              generator: () => 'from-generator',
              header: 'x-request-id'
            }
          }
        })
      )
      .get('/test', () => 'ok')

    const response = await app.handle(new Request('http://localhost/test'))

    expect(response.headers.get('x-request-id')).toBe('from-generator')
    expect(records.at(-1)?.meta?.context?.requestId).toBe('from-generator')
  })

  test('sets X-Request-Id response header on errors', async () => {
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: true
      }
    }

    const app = new Elysia().use(logixlysia(options)).get('/error', () => {
      throw new Error('something went wrong')
    })

    const response = await app.handle(new Request('http://localhost/error'))

    const responseId = response.headers.get('X-Request-Id')
    expect(responseId).toBeDefined()
    expect(responseId).toMatch(UUID_V4_REGEX)
  })

  describe('a requestId merged into the context', () => {
    test('keeps the request id on every line when a handler merges its own requestId', async () => {
      const { config, records } = capture()
      const app = new Elysia()
        .use(logixlysia({ config }))
        .get('/s', ({ log }) => {
          log.info('before')
          log.mergeContext({ requestId: 'upstream-123' })
          log.info('after')
          return 'ok'
        })

      const response = await app.handle(clientRequest('/s'))

      expect(response.headers.get('X-Request-Id')).toBe('client-abc')
      expect(records.map(r => r.meta?.context?.requestId)).toEqual([
        'client-abc',
        'client-abc',
        'client-abc'
      ])
    })

    test("echoes the plugin's id when the hook path would have read a merged one", async () => {
      const { config } = capture()
      const app = new Elysia({ aot: false })
        .use(logixlysia({ config }))
        .get('/s', ({ log }) => {
          log.mergeContext({ requestId: 'upstream-123' })
          return 'ok'
        })

      const response = await app.handle(clientRequest('/s'))

      expect(response.headers.get('X-Request-Id')).toBe('client-abc')
    })

    test('that is not a header value does not break the response', async () => {
      const { config } = capture()
      const app = new Elysia({ aot: false })
        .use(logixlysia({ config }))
        .get('/s', ({ log }) => {
          log.mergeContext({ requestId: 'a\r\nSet-Cookie: s=1' })
          return 'ok'
        })

      const response = await app.handle(clientRequest('/s'))

      expect(response.status).toBe(200)
      expect(response.headers.get('X-Request-Id')).toBe('client-abc')
      expect(response.headers.get('set-cookie')).toBeNull()
    })

    test('cannot be replaced by an enricher', async () => {
      const { config, records } = capture()
      const app = new Elysia()
        .use(
          logixlysia({
            config: {
              ...config,
              enrichers: [() => ({ requestId: 'from-enricher' })]
            }
          })
        )
        .get('/s', () => 'ok')

      await app.handle(clientRequest('/s'))

      expect(records.at(-1)?.meta?.context?.requestId).toBe('client-abc')
    })
  })
})
