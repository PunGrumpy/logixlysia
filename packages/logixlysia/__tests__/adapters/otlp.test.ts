import { describe, expect, test } from 'bun:test'

import { createOtlpTransport } from '../../src/otlp'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
  OTEL_EXPORTER_OTLP_HEADERS: undefined,
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: undefined,
  OTEL_EXPORTER_OTLP_LOGS_HEADERS: undefined,
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
      }>
    }>
  }>
}

describe('logixlysia/otlp', () => {
  test('throws without an endpoint', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() => createOtlpTransport()).toThrow('OTEL_EXPORTER_OTLP_ENDPOINT')
    } finally {
      restoreEnv()
    }
  })

  test('sends OTLP logs and parses headers from the environment', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/',
      OTEL_EXPORTER_OTLP_HEADERS: 'x-api-key=abc, x-team=core',
      OTEL_SERVICE_NAME: 'env-service'
    })
    const stub = stubFetch()
    try {
      const transport = createOtlpTransport()
      transport.log('ERROR', 'boom', { status: 500 })
      await transport.flush()

      const [call] = stub.calls
      expect(call?.url).toBe('http://collector:4318/v1/logs')
      expect(call?.headers['x-api-key']).toBe('abc')
      expect(call?.headers['x-team']).toBe('core')

      const payload = JSON.parse(call?.body ?? '{}') as OtlpPayload
      const record = payload.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]
      expect(record?.body.stringValue).toBe('boom')
      expect(record?.severityNumber).toBe(17)

      const serviceName = payload.resourceLogs[0]?.resource.attributes.find(
        attribute => attribute.key === 'service.name'
      )
      expect(serviceName?.value.stringValue).toBe('env-service')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('option headers override environment headers', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      OTEL_EXPORTER_OTLP_HEADERS: 'x-api-key=env-value'
    })
    const stub = stubFetch()
    try {
      const transport = createOtlpTransport({
        endpoint: 'http://collector:4318',
        headers: { 'x-api-key': 'option-value' }
      })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.headers['x-api-key']).toBe('option-value')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('prefers signal-specific endpoint (as-is) and headers', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://generic:4318',
      OTEL_EXPORTER_OTLP_HEADERS: 'x-api-key=generic',
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://logs:4318/custom/logs',
      OTEL_EXPORTER_OTLP_LOGS_HEADERS: 'x-api-key=logs%2Fkey'
    })
    const stub = stubFetch()
    try {
      const transport = createOtlpTransport()
      transport.log('INFO', 'hi')
      await transport.flush()

      const [call] = stub.calls
      expect(call?.url).toBe('http://logs:4318/custom/logs')
      expect(call?.headers['x-api-key']).toBe('logs/key')
    } finally {
      stub.restore()
      restoreEnv()
    }
  })
})
