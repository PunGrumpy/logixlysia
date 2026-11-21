import { describe, expect, mock, test } from 'bun:test'
import { createAxiomTransport } from '../../src/axiom'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  AXIOM_API_KEY: undefined,
  AXIOM_DATASET: undefined,
  AXIOM_EDGE: undefined,
  AXIOM_EDGE_URL: undefined,
  AXIOM_ORG_ID: undefined,
  AXIOM_URL: undefined
}

const EU_EDGE = 'eu-central-1.aws.edge.axiom.co'

const postedUrl = async (
  options: Parameters<typeof createAxiomTransport>[0] = {}
): Promise<string | undefined> => {
  const stub = stubFetch()
  try {
    const transport = createAxiomTransport({
      apiKey: 'xaat-test',
      dataset: 'my-logs',
      ...options
    })
    transport.log('INFO', 'hello')
    await transport.flush()
    return stub.calls[0]?.url
  } finally {
    stub.restore()
  }
}

const creationError = (
  options: Parameters<typeof createAxiomTransport>[0] = {}
): string => {
  try {
    createAxiomTransport({
      apiKey: 'xaat-test',
      dataset: 'my-logs',
      ...options
    })
  } catch (error) {
    const { message } = error as Error
    return message
  }
  return ''
}

describe('logixlysia/axiom', () => {
  test('throws without an API token', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() => createAxiomTransport()).toThrow('AXIOM_API_KEY')
    } finally {
      restoreEnv()
    }
  })

  test('throws without a dataset', () => {
    const restoreEnv = stubEnv({ ...CLEAR_ENV, AXIOM_API_KEY: 'xaat-test' })
    try {
      expect(() => createAxiomTransport()).toThrow('AXIOM_DATASET')
    } finally {
      restoreEnv()
    }
  })

  test('reads credentials from the environment', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      AXIOM_API_KEY: 'xaat-test',
      AXIOM_DATASET: 'my-logs',
      AXIOM_ORG_ID: 'my-org'
    })
    const stub = stubFetch()
    try {
      const transport = createAxiomTransport()
      transport.log('INFO', 'hello', { status: 200 })
      await transport.flush()

      expect(stub.calls).toHaveLength(1)
      const [call] = stub.calls
      expect(call?.url).toBe('https://api.axiom.co/v1/datasets/my-logs/ingest')
      expect(call?.headers.authorization).toBe('Bearer xaat-test')
      expect(call?.headers['x-axiom-org-id']).toBe('my-org')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('reports the events an ingest response failed', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch([
      {
        body: '{"ingested":1,"failed":2,"failures":[{"error":"invalid timestamp"}]}',
        status: 200
      }
    ])
    const onDropped = mock((_info: unknown) => {})
    const onError = mock((_error: unknown) => {})
    try {
      const transport = createAxiomTransport({
        apiKey: 'xaat-test',
        dataset: 'my-logs',
        onDropped,
        onError
      })
      for (const message of ['a', 'b', 'c']) {
        transport.log('INFO', message)
      }
      await transport.flush()

      expect(stub.calls).toHaveLength(1)
      expect(onDropped.mock.calls).toEqual([[{ count: 2, reason: 'rejected' }]])
      const [error] = onError.mock.calls[0] ?? []
      expect((error as Error).message).toEndWith(
        'backend rejected 2 of 3 entries — invalid timestamp'
      )
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('posts to the edge ingest path when an edge domain is set', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(await postedUrl({ edge: EU_EDGE })).toBe(
        `https://${EU_EDGE}/v1/ingest/my-logs`
      )
    } finally {
      restoreEnv()
    }
  })

  test('reads the edge domain from AXIOM_EDGE', async () => {
    const restoreEnv = stubEnv({ ...CLEAR_ENV, AXIOM_EDGE: EU_EDGE })
    try {
      expect(await postedUrl()).toBe(`https://${EU_EDGE}/v1/ingest/my-logs`)
    } finally {
      restoreEnv()
    }
  })

  test('adds the edge path to an edge URL that has none', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(await postedUrl({ edgeUrl: 'http://localhost:3400/' })).toBe(
        'http://localhost:3400/v1/ingest/my-logs'
      )
    } finally {
      restoreEnv()
    }
  })

  test('uses an edge URL with a path as given', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(
        await postedUrl({ edgeUrl: 'http://localhost:3400/ingest/' })
      ).toBe('http://localhost:3400/ingest')
    } finally {
      restoreEnv()
    }
  })

  test('percent-encodes the dataset in the edge path', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(await postedUrl({ dataset: 'my logs/x', edge: EU_EDGE })).toBe(
        `https://${EU_EDGE}/v1/ingest/my%20logs%2Fx`
      )
    } finally {
      restoreEnv()
    }
  })

  test('prefers edgeUrl to edge, and edge to baseUrl', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(
        await postedUrl({
          baseUrl: 'https://base.example.com',
          edge: EU_EDGE,
          edgeUrl: 'https://proxy.example.com'
        })
      ).toBe('https://proxy.example.com/v1/ingest/my-logs')
      expect(
        await postedUrl({ baseUrl: 'https://base.example.com', edge: EU_EDGE })
      ).toBe(`https://${EU_EDGE}/v1/ingest/my-logs`)
    } finally {
      restoreEnv()
    }
  })

  test('applies the same order to the environment variables', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      AXIOM_EDGE: EU_EDGE,
      AXIOM_EDGE_URL: 'https://proxy.example.com',
      AXIOM_URL: 'https://base.example.com'
    })
    try {
      expect(await postedUrl()).toBe(
        'https://proxy.example.com/v1/ingest/my-logs'
      )
    } finally {
      restoreEnv()
    }
    const restoreEdgeOnly = stubEnv({
      ...CLEAR_ENV,
      AXIOM_EDGE: EU_EDGE,
      AXIOM_URL: 'https://base.example.com'
    })
    try {
      expect(await postedUrl()).toBe(`https://${EU_EDGE}/v1/ingest/my-logs`)
    } finally {
      restoreEdgeOnly()
    }
  })

  test('an endpoint option beats the edge environment variables', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      AXIOM_EDGE: EU_EDGE,
      AXIOM_EDGE_URL: 'https://proxy.example.com'
    })
    try {
      expect(await postedUrl({ baseUrl: 'https://base.example.com' })).toBe(
        'https://base.example.com/v1/datasets/my-logs/ingest'
      )
    } finally {
      restoreEnv()
    }
  })

  test('strips trailing slashes from the path of an edge URL, never from its query', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(
        await postedUrl({
          edgeUrl: 'https://proxy.example.com/ingest/?tenant=a'
        })
      ).toBe('https://proxy.example.com/ingest?tenant=a')
      expect(
        await postedUrl({ edgeUrl: 'https://proxy.example.com/?tenant=a' })
      ).toBe('https://proxy.example.com/v1/ingest/my-logs?tenant=a')
      expect(
        await postedUrl({
          edgeUrl: 'https://proxy.example.com/ingest?tenant=a/'
        })
      ).toBe('https://proxy.example.com/ingest?tenant=a/')
      expect(await postedUrl({ edgeUrl: 'https://proxy.example.com//' })).toBe(
        'https://proxy.example.com/v1/ingest/my-logs'
      )
    } finally {
      restoreEnv()
    }
  })

  test('accepts an edge domain with a port', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(await postedUrl({ edge: 'localhost:3400' })).toBe(
        'https://localhost:3400/v1/ingest/my-logs'
      )
    } finally {
      restoreEnv()
    }
  })

  test('rejects an edge value that is not a domain, without echoing it', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      for (const edge of [
        'proxy.example.com?tenant=a',
        'proxy.example.com#x',
        'user@proxy.example.com',
        'proxy.example.com\\x',
        ' proxy.example.com',
        '',
        `https://${EU_EDGE}`,
        `${EU_EDGE}/v1`
      ]) {
        const message = creationError({ edge })
        expect(message).toContain('edge (AXIOM_EDGE) must be a domain')
        expect(message).toContain('edgeUrl')
        for (const leaked of [
          'tenant',
          'user@',
          '/v1',
          'https://eu-central-1',
          'proxy.example.com'
        ]) {
          expect(message).not.toContain(leaked)
        }
      }
    } finally {
      restoreEnv()
    }
  })

  test('rejects an edge URL that does not parse, without echoing it', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      for (const edgeUrl of ['not a url?token=abc123', '']) {
        const message = creationError({ edgeUrl })
        expect(message).toContain(
          'edgeUrl (AXIOM_EDGE_URL) must be a full URL without credentials'
        )
        expect(message).not.toContain('abc123')
      }
    } finally {
      restoreEnv()
    }
  })

  test('rejects an edge URL with a user name or a password, without echoing it', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      const message = creationError({
        edgeUrl: 'https://user:secret@proxy.example.com'
      })
      expect(message).toContain('edgeUrl')
      expect(message).toContain('without credentials')
      expect(message).not.toContain('secret')
      expect(message).not.toContain('proxy.example.com')
    } finally {
      restoreEnv()
    }
  })

  test('rejects an edge domain that does not make a valid URL, without echoing it', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      for (const edge of ['a.example:99999', '999.999.999.999']) {
        const message = creationError({ edge })
        expect(message).toContain('edge (AXIOM_EDGE) must be a domain')
        expect(message).not.toContain('a.example')
        expect(message).not.toContain('999')
      }
    } finally {
      restoreEnv()
    }
  })

  test('treats a null endpoint option as not passed', async () => {
    const restoreUrl = stubEnv({
      ...CLEAR_ENV,
      AXIOM_URL: 'https://env.example.com'
    })
    try {
      expect(await postedUrl({ baseUrl: null as unknown as undefined })).toBe(
        'https://env.example.com/v1/datasets/my-logs/ingest'
      )
    } finally {
      restoreUrl()
    }
    const restoreEdge = stubEnv({ ...CLEAR_ENV, AXIOM_EDGE: EU_EDGE })
    try {
      expect(await postedUrl({ edge: null as unknown as undefined })).toBe(
        `https://${EU_EDGE}/v1/ingest/my-logs`
      )
    } finally {
      restoreEdge()
    }
  })

  test('rejects an edge URL that is not http or https', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(creationError({ edgeUrl: 'ftp://proxy.example.com' })).toContain(
        'http or https'
      )
    } finally {
      restoreEnv()
    }
  })

  test('uses the first endpoint option that is passed, even when it is empty', () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      AXIOM_EDGE: EU_EDGE,
      AXIOM_EDGE_URL: 'https://proxy.example.com',
      AXIOM_URL: 'https://base.example.com'
    })
    try {
      expect(creationError({ baseUrl: '' })).toContain('invalid endpoint URL')
      expect(
        creationError({ baseUrl: 'https://base.example.com', edge: '' })
      ).toContain('edge (AXIOM_EDGE) must be a domain')
    } finally {
      restoreEnv()
    }
  })

  test('skips an empty endpoint variable', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      AXIOM_EDGE: '',
      AXIOM_URL: 'https://env.example.com'
    })
    try {
      expect(await postedUrl()).toBe(
        'https://env.example.com/v1/datasets/my-logs/ingest'
      )
    } finally {
      restoreEnv()
    }
  })

  test('sends the organization id on an edge request', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createAxiomTransport({
        apiKey: 'xaat-test',
        dataset: 'my-logs',
        edge: EU_EDGE,
        orgId: 'my-org'
      })
      transport.log('INFO', 'hello')
      await transport.flush()

      expect(stub.calls[0]?.url).toBe(`https://${EU_EDGE}/v1/ingest/my-logs`)
      expect(stub.calls[0]?.headers['x-axiom-org-id']).toBe('my-org')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('counts failed events from an edge response', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch([
      {
        body: '{"ingested":1,"failed":2,"failures":[{"error":"invalid timestamp"}]}',
        status: 200
      }
    ])
    const onDropped = mock((_info: unknown) => {})
    const onError = mock((_error: unknown) => {})
    try {
      const transport = createAxiomTransport({
        apiKey: 'xaat-test',
        dataset: 'my-logs',
        edge: EU_EDGE,
        onDropped,
        onError
      })
      for (const message of ['a', 'b', 'c']) {
        transport.log('INFO', message)
      }
      await transport.flush()

      expect(stub.calls).toHaveLength(1)
      expect(stub.calls[0]?.url).toBe(`https://${EU_EDGE}/v1/ingest/my-logs`)
      expect(onDropped.mock.calls).toEqual([[{ count: 2, reason: 'rejected' }]])
      const [error] = onError.mock.calls[0] ?? []
      expect((error as Error).message).toEndWith(
        'backend rejected 2 of 3 entries — invalid timestamp'
      )
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('reports nothing when no event failed', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch([{ body: '{"ingested":3,"failed":0}', status: 200 }])
    const onDropped = mock((_info: unknown) => {})
    const onError = mock((_error: unknown) => {})
    try {
      const transport = createAxiomTransport({
        apiKey: 'xaat-test',
        dataset: 'my-logs',
        onDropped,
        onError
      })
      for (const message of ['a', 'b', 'c']) {
        transport.log('INFO', message)
      }
      await transport.flush()

      expect(onDropped).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test.each(['true', '"2"', '[2]'])(
    'reports nothing when failed is %s instead of a number',
    async failed => {
      const restoreEnv = stubEnv(CLEAR_ENV)
      const stub = stubFetch([
        { body: `{"ingested":1,"failed":${failed}}`, status: 200 }
      ])
      const onDropped = mock((_info: unknown) => {})
      const onError = mock((_error: unknown) => {})
      try {
        const transport = createAxiomTransport({
          apiKey: 'xaat-test',
          dataset: 'my-logs',
          onDropped,
          onError
        })
        transport.log('INFO', 'a')
        await transport.flush()

        expect(onDropped).not.toHaveBeenCalled()
        expect(onError).not.toHaveBeenCalled()
      } finally {
        stub.restore()
        restoreEnv()
      }
    }
  )

  test('sends events with _time, level, message, and meta', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createAxiomTransport({
        apiKey: 'xaat-test',
        dataset: 'my-logs'
      })
      transport.log('ERROR', 'boom', {
        context: { requestId: 'r1' },
        status: 500
      })
      await transport.flush()

      const events = JSON.parse(stub.calls[0]?.body ?? '[]') as Record<
        string,
        unknown
      >[]
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        context: { requestId: 'r1' },
        level: 'ERROR',
        message: 'boom',
        status: 500
      })
      expect(typeof events[0]?._time).toBe('string')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('option overrides beat environment variables', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      AXIOM_API_KEY: 'xaat-env',
      AXIOM_DATASET: 'env-logs',
      AXIOM_URL: 'https://env.example.com'
    })
    const stub = stubFetch()
    try {
      const transport = createAxiomTransport({
        baseUrl: 'https://self-hosted.example.com/',
        dataset: 'override-logs'
      })
      transport.log('INFO', 'hi')
      await transport.flush()

      expect(stub.calls[0]?.url).toBe(
        'https://self-hosted.example.com/v1/datasets/override-logs/ingest'
      )
      expect(stub.calls[0]?.headers.authorization).toBe('Bearer xaat-env')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('throws for an invalid base URL', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() =>
        createAxiomTransport({
          apiKey: 'xaat-test',
          baseUrl: 'not a url',
          dataset: 'my-logs'
        })
      ).toThrow('Axiom')
    } finally {
      restoreEnv()
    }
  })

  test('meta cannot overwrite _time, level, or message', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createAxiomTransport({
        apiKey: 'xaat-test',
        dataset: 'my-logs'
      })
      transport.log('ERROR', 'real', {
        _time: 'spoofed',
        level: 'SPOOFED',
        message: 'spoofed'
      })
      await transport.flush()

      const events = JSON.parse(stub.calls[0]?.body ?? '[]') as Record<
        string,
        unknown
      >[]
      expect(events[0]?.level).toBe('ERROR')
      expect(events[0]?.message).toBe('real')
      expect(events[0]?._time).not.toBe('spoofed')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('serializes BigInts and circular references instead of dropping the batch', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createAxiomTransport({
        apiKey: 'xaat-test',
        dataset: 'my-logs'
      })
      const node: Record<string, unknown> = { name: 'n' }
      node.self = node
      transport.log('INFO', 'a', { id: 1n })
      transport.log('INFO', 'b', { ok: true })
      transport.log('INFO', 'c', { node })
      await transport.flush()

      expect(stub.calls).toHaveLength(1)
      const events = JSON.parse(stub.calls[0]?.body ?? '[]') as Record<
        string,
        unknown
      >[]
      expect(events).toHaveLength(3)
      expect(events[0]?.id).toBe('1')
      expect(events[1]?.ok).toBe(true)
      expect(events[2]?.node).toMatchObject({ self: '[Circular]' })
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('serializes each record on its own, so one bad value does not take the batch', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createAxiomTransport({
        apiKey: 'xaat-test',
        dataset: 'my-logs'
      })
      transport.log('INFO', 'a', { ok: 1 })
      transport.log('INFO', 'b', {
        bad: {
          toJSON: () => {
            throw new Error('x')
          }
        }
      })
      transport.log('INFO', 'c', { ok: 2 })
      await transport.flush()

      const events = JSON.parse(stub.calls[0]?.body ?? '[]') as Record<
        string,
        unknown
      >[]
      expect(events).toHaveLength(3)
      expect(events[1]?.bad).toBe('[Unserializable]')
      expect(events[0]?.ok).toBe(1)
      expect(events[2]?.ok).toBe(2)
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('ships the record as it was when logged', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createAxiomTransport({
        apiKey: 'xaat-test',
        dataset: 'my-logs'
      })
      const cart = { total: 1 }
      transport.log('INFO', 'cart', { context: { cart } })
      cart.total = 2
      await transport.flush()

      const [event] = JSON.parse(stub.calls[0]?.body ?? '[]') as {
        context?: { cart?: { total?: number } }
      }[]
      expect(event?.context?.cart?.total).toBe(1)
    } finally {
      stub.restore()
      restoreEnv()
    }
  })
})
