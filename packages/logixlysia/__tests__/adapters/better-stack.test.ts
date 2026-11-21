import { describe, expect, test } from 'bun:test'
import { createBetterStackTransport } from '../../src/better-stack'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  BETTER_STACK_INGESTING_HOST: undefined,
  BETTER_STACK_SOURCE_TOKEN: undefined
}

describe('logixlysia/better-stack', () => {
  test('throws without a source token', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() => createBetterStackTransport()).toThrow(
        'BETTER_STACK_SOURCE_TOKEN'
      )
    } finally {
      restoreEnv()
    }
  })

  test('sends logs with dt, level, message, and meta', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      BETTER_STACK_SOURCE_TOKEN: 'bs-token'
    })
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport()
      transport.log('INFO', 'hello', { status: 200 })
      await transport.flush()

      const [call] = stub.calls
      expect(call?.url).toBe('https://in.logs.betterstack.com/')
      expect(call?.headers.authorization).toBe('Bearer bs-token')

      const logs = JSON.parse(call?.body ?? '[]') as Record<string, unknown>[]
      expect(logs[0]).toMatchObject({
        level: 'INFO',
        message: 'hello',
        status: 200
      })
      expect(typeof logs[0]?.dt).toBe('string')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('uses a dedicated ingesting host when configured', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      BETTER_STACK_INGESTING_HOST: 'https://s123.eu-nbg-2.betterstackdata.com/'
    })
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport({ sourceToken: 'bs-token' })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.url).toBe(
        'https://s123.eu-nbg-2.betterstackdata.com/'
      )
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('accepts an ingesting host without a scheme from the environment', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      BETTER_STACK_INGESTING_HOST: 's123.eu-nbg-2.betterstackdata.com'
    })
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport({ sourceToken: 'bs-token' })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.url).toBe(
        'https://s123.eu-nbg-2.betterstackdata.com/'
      )
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('accepts an endpoint option without a scheme', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport({
        endpoint: 's123.eu-nbg-2.betterstackdata.com',
        sourceToken: 'bs-token'
      })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.url).toBe(
        'https://s123.eu-nbg-2.betterstackdata.com/'
      )
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('sends a host with a port over https', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport({
        endpoint: 'localhost:8080',
        sourceToken: 'bs-token'
      })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.url).toBe('https://localhost:8080/')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('keeps the scheme of a full URL', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport({
        endpoint: 'http://localhost:8080',
        sourceToken: 'bs-token'
      })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.url).toBe('http://localhost:8080/')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('still rejects a scheme other than http or https', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() =>
        createBetterStackTransport({
          endpoint: 'ftp://logs.example.com',
          sourceToken: 'bs-token'
        })
      ).toThrow('http or https')
    } finally {
      restoreEnv()
    }
  })

  test('accepts a host with a path', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport({
        endpoint: 's1.example.com/ingest/',
        sourceToken: 'bs-token'
      })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.url).toBe('https://s1.example.com/ingest')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('ignores whitespace around a host', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport({
        endpoint: ' s1.example.com ',
        sourceToken: 'bs-token'
      })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.url).toBe('https://s1.example.com/')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('leaves a value that already parses as an http URL alone', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const spaced = createBetterStackTransport({
        endpoint: ' https://s1.example.com ',
        sourceToken: 'bs-token'
      })
      spaced.log('INFO', 'hi')
      await spaced.flush()
      const oneSlash = createBetterStackTransport({
        endpoint: 'http:/logs.example.com',
        sourceToken: 'bs-token'
      })
      oneSlash.log('INFO', 'hi')
      await oneSlash.flush()
      expect(stub.calls.map(call => call.url)).toEqual([
        'https://s1.example.com/',
        'http://logs.example.com/'
      ])
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('does not turn another scheme into a host', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() =>
        createBetterStackTransport({
          endpoint: 'ftp:/logs.example.com',
          sourceToken: 'bs-token'
        })
      ).toThrow('http or https')
    } finally {
      restoreEnv()
    }
  })

  test('does not turn a path into a host', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() =>
        createBetterStackTransport({
          endpoint: '/v1/logs',
          sourceToken: 'bs-token'
        })
      ).toThrow("invalid endpoint URL '/v1/logs'")
    } finally {
      restoreEnv()
    }
  })

  test('reports an invalid value as the caller wrote it', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      let thrown: unknown
      try {
        createBetterStackTransport({
          endpoint: 'not a url',
          sourceToken: 'bs-token'
        })
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(Error)
      const { message } = thrown as Error
      expect(message).toContain("'not a url'")
      expect(message).not.toContain('https://')
    } finally {
      restoreEnv()
    }
  })

  test('throws for an invalid endpoint', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() =>
        createBetterStackTransport({
          endpoint: 'not a url',
          sourceToken: 'bs-token'
        })
      ).toThrow('Better Stack')
    } finally {
      restoreEnv()
    }
  })

  test('meta cannot overwrite dt, level, or message', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport({ sourceToken: 'bs-token' })
      transport.log('ERROR', 'real', {
        dt: 'spoofed',
        level: 'SPOOFED',
        message: 'spoofed'
      })
      await transport.flush()

      const logs = JSON.parse(stub.calls[0]?.body ?? '[]') as Record<
        string,
        unknown
      >[]
      expect(logs[0]?.level).toBe('ERROR')
      expect(logs[0]?.message).toBe('real')
      expect(logs[0]?.dt).not.toBe('spoofed')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('serializes BigInts and circular references instead of dropping the batch', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      BETTER_STACK_SOURCE_TOKEN: 'bs-token'
    })
    const stub = stubFetch()
    try {
      const transport = createBetterStackTransport()
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
})
