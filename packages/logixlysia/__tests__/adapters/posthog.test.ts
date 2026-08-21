import { describe, expect, test } from 'bun:test'

import { createPostHogTransport } from '../../src/posthog'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  POSTHOG_API_KEY: undefined,
  POSTHOG_HOST: undefined
}

interface CaptureBatch {
  api_key: string
  batch: Array<{
    distinct_id: string
    event: string
    properties: Record<string, unknown>
    timestamp: string
  }>
}

describe('logixlysia/posthog', () => {
  test('throws without an API key', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() => createPostHogTransport()).toThrow('POSTHOG_API_KEY')
    } finally {
      restoreEnv()
    }
  })

  test('captures events via the batch API', async () => {
    const restoreEnv = stubEnv({ ...CLEAR_ENV, POSTHOG_API_KEY: 'phc_test' })
    const stub = stubFetch()
    try {
      const transport = createPostHogTransport()
      transport.log('INFO', 'hello', {
        durationMs: 4,
        request: { method: 'GET', url: 'http://localhost/x' },
        status: 200
      })
      await transport.flush()

      const [call] = stub.calls
      expect(call?.url).toBe('https://us.i.posthog.com/batch/')

      const payload = JSON.parse(call?.body ?? '{}') as CaptureBatch
      expect(payload.api_key).toBe('phc_test')
      expect(payload.batch).toHaveLength(1)
      expect(payload.batch[0]).toMatchObject({
        distinct_id: 'logixlysia-server',
        event: 'logixlysia_log'
      })
      expect(payload.batch[0]?.properties).toMatchObject({
        durationMs: 4,
        level: 'INFO',
        message: 'hello',
        'request.method': 'GET',
        status: 200
      })
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('resolves distinct_id from the request context', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createPostHogTransport({ apiKey: 'phc_test' })
      transport.log('INFO', 'who', { context: { userId: 'user-42' } })
      await transport.flush()

      const payload = JSON.parse(stub.calls[0]?.body ?? '{}') as CaptureBatch
      expect(payload.batch[0]?.distinct_id).toBe('user-42')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('supports EU host and custom event name and identity field', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createPostHogTransport({
        apiKey: 'phc_test',
        distinctId: 'billing-service',
        distinctIdField: 'context.accountId',
        eventName: 'api_log',
        host: 'https://eu.i.posthog.com/'
      })
      transport.log('INFO', 'first', { context: { accountId: 'acct-1' } })
      transport.log('INFO', 'second', {})
      await transport.flush()

      const payload = JSON.parse(stub.calls[0]?.body ?? '{}') as CaptureBatch
      expect(stub.calls[0]?.url).toBe('https://eu.i.posthog.com/batch/')
      expect(payload.batch[0]).toMatchObject({
        distinct_id: 'acct-1',
        event: 'api_log'
      })
      expect(payload.batch[1]?.distinct_id).toBe('billing-service')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('meta cannot overwrite level or message properties', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createPostHogTransport({ apiKey: 'phc_test' })
      transport.log('ERROR', 'real', { level: 'SPOOFED', message: 'spoofed' })
      await transport.flush()

      const payload = JSON.parse(stub.calls[0]?.body ?? '{}') as CaptureBatch
      expect(payload.batch[0]?.properties).toMatchObject({
        level: 'ERROR',
        message: 'real'
      })
    } finally {
      stub.restore()
      restoreEnv()
    }
  })
})
