import { describe, expect, test } from 'bun:test'

import { createAxiomTransport } from '../../src/axiom'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  AXIOM_API_KEY: undefined,
  AXIOM_DATASET: undefined,
  AXIOM_ORG_ID: undefined,
  AXIOM_URL: undefined
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
})
