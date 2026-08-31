import { describe, expect, test } from 'bun:test'

import { createHyperDXTransport } from '../../src/hyperdx'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  HYPERDX_API_KEY: undefined,
  HYPERDX_OTLP_ENDPOINT: undefined,
  HYPERDX_SERVICE_NAME: undefined,
  OTEL_SERVICE_NAME: undefined
}

interface OtlpAttribute {
  key: string
  value: Record<string, unknown>
}

interface OtlpPayload {
  resourceLogs: Array<{
    resource: { attributes: OtlpAttribute[] }
    scopeLogs: Array<{
      logRecords: Array<{
        attributes: OtlpAttribute[]
        body: { stringValue: string }
        severityNumber: number
        severityText: string
        timeUnixNano: string
      }>
    }>
  }>
}

describe('logixlysia/hyperdx', () => {
  test('throws without an API key', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() => createHyperDXTransport()).toThrow('HYPERDX_API_KEY')
    } finally {
      restoreEnv()
    }
  })

  test('sends OTLP logs to the default endpoint', async () => {
    const restoreEnv = stubEnv({ ...CLEAR_ENV, HYPERDX_API_KEY: 'hdx-key' })
    const stub = stubFetch()
    try {
      const transport = createHyperDXTransport({ serviceName: 'my-api' })
      transport.log('WARNING', 'careful', {
        durationMs: 12.5,
        request: { method: 'GET', url: 'http://localhost/x' }
      })
      await transport.flush()

      const [call] = stub.calls
      expect(call?.url).toBe('https://in-otel.hyperdx.io/v1/logs')
      expect(call?.headers.authorization).toBe('hdx-key')

      const payload = JSON.parse(call?.body ?? '{}') as OtlpPayload
      const record = payload.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]
      expect(record?.body.stringValue).toBe('careful')
      expect(record?.severityNumber).toBe(13)
      expect(record?.severityText).toBe('WARNING')

      const serviceName = payload.resourceLogs[0]?.resource.attributes.find(
        attribute => attribute.key === 'service.name'
      )
      expect(serviceName?.value.stringValue).toBe('my-api')

      const method = record?.attributes.find(
        attribute => attribute.key === 'request.method'
      )
      expect(method?.value.stringValue).toBe('GET')
      const duration = record?.attributes.find(
        attribute => attribute.key === 'durationMs'
      )
      expect(duration?.value.doubleValue).toBe(12.5)
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('appends /v1/logs to a self-hosted endpoint', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createHyperDXTransport({
        apiKey: 'hdx-key',
        endpoint: 'http://collector:4318/'
      })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.url).toBe('http://collector:4318/v1/logs')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })
})
