import { describe, expect, test } from 'bun:test'

import { createLokiTransport } from '../../src/loki'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  LOKI_PASSWORD: undefined,
  LOKI_SERVICE_NAME: undefined,
  LOKI_TENANT_ID: undefined,
  LOKI_URL: undefined,
  LOKI_USERNAME: undefined,
  OTEL_SERVICE_NAME: undefined
}

const NANO_TIMESTAMP = /^\d+$/

interface LokiPayload {
  streams: Array<{
    stream: Record<string, string>
    values: [string, string][]
  }>
}

describe('logixlysia/loki', () => {
  test('throws without a URL', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() => createLokiTransport()).toThrow('LOKI_URL')
    } finally {
      restoreEnv()
    }
  })

  test('pushes level-grouped streams with JSON lines', async () => {
    const restoreEnv = stubEnv({ ...CLEAR_ENV, LOKI_URL: 'http://loki:3100/' })
    const stub = stubFetch()
    try {
      const transport = createLokiTransport({
        labels: { env: 'test' },
        maxBatchSize: 10,
        serviceName: 'my-api'
      })
      transport.log('INFO', 'first', { status: 200 })
      transport.log('INFO', 'second', { status: 201 })
      transport.log('ERROR', 'boom', { status: 500 })
      await transport.flush()

      const [call] = stub.calls
      expect(call?.url).toBe('http://loki:3100/loki/api/v1/push')

      const payload = JSON.parse(call?.body ?? '{}') as LokiPayload
      expect(payload.streams).toHaveLength(2)

      const infoStream = payload.streams.find(
        stream => stream.stream.level === 'INFO'
      )
      expect(infoStream?.stream).toEqual({
        env: 'test',
        level: 'INFO',
        service_name: 'my-api'
      })
      expect(infoStream?.values).toHaveLength(2)

      const [timestamp, line] = infoStream?.values[0] ?? ['', '']
      expect(timestamp).toMatch(NANO_TIMESTAMP)
      expect(JSON.parse(line)).toMatchObject({ message: 'first', status: 200 })
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('sends basic auth and tenant headers', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createLokiTransport({
        password: 'secret',
        tenantId: 'team-a',
        url: 'https://logs.grafana.net',
        username: '12345'
      })
      transport.log('INFO', 'hi')
      await transport.flush()

      const [call] = stub.calls
      expect(call?.headers.authorization).toBe(
        `Basic ${Buffer.from('12345:secret').toString('base64')}`
      )
      expect(call?.headers['x-scope-orgid']).toBe('team-a')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('meta cannot overwrite the log line message', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createLokiTransport({ url: 'http://loki:3100' })
      transport.log('INFO', 'real', { message: 'spoofed' })
      await transport.flush()

      const payload = JSON.parse(stub.calls[0]?.body ?? '{}') as LokiPayload
      const [, line] = payload.streams[0]?.values[0] ?? ['', '']
      expect(JSON.parse(line)).toMatchObject({ message: 'real' })
    } finally {
      stub.restore()
      restoreEnv()
    }
  })
})
