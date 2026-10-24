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
