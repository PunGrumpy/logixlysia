import { describe, expect, test } from 'bun:test'

import { createDatadogTransport } from '../../src/datadog'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  DD_API_KEY: undefined,
  DD_HOSTNAME: undefined,
  DD_SERVICE: undefined,
  DD_SITE: undefined
}

describe('logixlysia/datadog', () => {
  test('throws without an API key', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() => createDatadogTransport()).toThrow('DD_API_KEY')
    } finally {
      restoreEnv()
    }
  })

  test('sends logs to the v2 intake with status and meta', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      DD_API_KEY: 'dd-key',
      DD_SERVICE: 'my-api'
    })
    const stub = stubFetch()
    try {
      const transport = createDatadogTransport({ tags: { team: 'backend' } })
      transport.log('WARNING', 'careful', {
        request: { method: 'GET', url: 'http://localhost/x' },
        status: 429
      })
      await transport.flush()

      const [call] = stub.calls
      expect(call?.url).toBe(
        'https://http-intake.logs.datadoghq.com/api/v2/logs'
      )
      expect(call?.headers['dd-api-key']).toBe('dd-key')

      const logs = JSON.parse(call?.body ?? '[]') as Record<string, unknown>[]
      expect(logs).toHaveLength(1)
      expect(logs[0]).toMatchObject({
        ddsource: 'logixlysia',
        ddtags: 'team:backend',
        http: { status_code: 429 },
        message: 'careful',
        request: { method: 'GET', url: 'http://localhost/x' },
        service: 'my-api',
        status: 'warning'
      })
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('respects the DD_SITE region', async () => {
    const restoreEnv = stubEnv({ ...CLEAR_ENV, DD_SITE: 'datadoghq.eu' })
    const stub = stubFetch()
    try {
      const transport = createDatadogTransport({ apiKey: 'dd-key' })
      transport.log('INFO', 'hi')
      await transport.flush()
      expect(stub.calls[0]?.url).toBe(
        'https://http-intake.logs.datadoghq.eu/api/v2/logs'
      )
    } finally {
      stub.restore()
      restoreEnv()
    }
  })
})
