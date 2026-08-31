import { describe, expect, test } from 'bun:test'

import { createSentryTransport } from '../../src/sentry'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  SENTRY_DSN: undefined,
  SENTRY_ENVIRONMENT: undefined,
  SENTRY_RELEASE: undefined
}

const DSN = 'https://publickey@o123.ingest.sentry.io/456'
const TRACE_ID_HEX = /^[0-9a-f]{32}$/

interface SentryLogItem {
  attributes: Record<string, { type: string; value: unknown }>
  body: string
  level: string
  timestamp: number
  trace_id: string
}

const parseEnvelope = (
  body: string
): { header: unknown; itemHeader: unknown; items: SentryLogItem[] } => {
  const [header, itemHeader, payload] = body.split('\n')
  return {
    header: JSON.parse(header ?? '{}'),
    itemHeader: JSON.parse(itemHeader ?? '{}'),
    items: (JSON.parse(payload ?? '{}') as { items: SentryLogItem[] }).items
  }
}

describe('logixlysia/sentry', () => {
  test('throws without a DSN', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() => createSentryTransport()).toThrow('SENTRY_DSN')
    } finally {
      restoreEnv()
    }
  })

  test('throws on a malformed DSN', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() =>
        createSentryTransport({ dsn: 'https://sentry.io/' })
      ).toThrow('invalid DSN')
    } finally {
      restoreEnv()
    }
  })

  test('sends a log envelope to the project envelope endpoint', async () => {
    const restoreEnv = stubEnv({ ...CLEAR_ENV, SENTRY_DSN: DSN })
    const stub = stubFetch()
    try {
      const transport = createSentryTransport({
        environment: 'production',
        tags: { team: 'backend' }
      })
      transport.log('ERROR', 'boom', {
        durationMs: 3,
        status: 500
      })
      await transport.flush()

      const [call] = stub.calls
      expect(call?.url).toBe('https://o123.ingest.sentry.io/api/456/envelope/')
      expect(call?.headers['content-type']).toBe(
        'application/x-sentry-envelope'
      )
      expect(call?.headers['x-sentry-auth']).toContain('sentry_key=publickey')

      const { itemHeader, items } = parseEnvelope(call?.body ?? '')
      expect(itemHeader).toMatchObject({
        content_type: 'application/vnd.sentry.items.log+json',
        item_count: 1,
        type: 'log'
      })
      const [item] = items
      expect(item?.body).toBe('boom')
      expect(item?.level).toBe('error')
      expect(item?.trace_id).toMatch(TRACE_ID_HEX)
      expect(item?.attributes['sentry.environment']).toEqual({
        type: 'string',
        value: 'production'
      })
      expect(item?.attributes.team).toEqual({
        type: 'string',
        value: 'backend'
      })
      expect(item?.attributes.status).toEqual({ type: 'integer', value: 500 })
      expect(item?.attributes.durationMs).toEqual({
        type: 'integer',
        value: 3
      })
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('reuses a trace id from the request context', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    const traceId = 'abcdefabcdefabcdefabcdefabcdef12'
    try {
      const transport = createSentryTransport({ dsn: DSN })
      transport.log('INFO', 'traced', {
        context: { trace_id: traceId }
      })
      await transport.flush()

      const { items } = parseEnvelope(stub.calls[0]?.body ?? '')
      expect(items[0]?.trace_id).toBe(traceId)
    } finally {
      stub.restore()
      restoreEnv()
    }
  })
})
