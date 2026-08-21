import { describe, expect, test } from 'bun:test'

import { createClickHouseTransport } from '../../src/clickhouse'
import { stubEnv, stubFetch } from './helpers'

const CLEAR_ENV = {
  CLICKHOUSE_DATABASE: undefined,
  CLICKHOUSE_PASSWORD: undefined,
  CLICKHOUSE_TABLE: undefined,
  CLICKHOUSE_URL: undefined,
  CLICKHOUSE_USERNAME: undefined
}

describe('logixlysia/clickhouse', () => {
  test('rejects identifiers that are not plain names', () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    try {
      expect(() =>
        createClickHouseTransport({ table: 'logs; DROP TABLE users' })
      ).toThrow('invalid table')
    } finally {
      restoreEnv()
    }
  })

  test('inserts JSONEachRow rows with flattened attributes', async () => {
    const restoreEnv = stubEnv(CLEAR_ENV)
    const stub = stubFetch()
    try {
      const transport = createClickHouseTransport({
        password: 'secret',
        username: 'writer'
      })
      transport.log('INFO', 'hello', {
        context: { requestId: 'r1' },
        status: 200
      })
      transport.log('ERROR', 'boom', { status: 500 })
      await transport.flush()

      const [call] = stub.calls
      const url = new URL(call?.url ?? '')
      expect(url.origin).toBe('http://localhost:8123')
      expect(url.searchParams.get('query')).toBe(
        'INSERT INTO default.logs FORMAT JSONEachRow'
      )
      expect(url.searchParams.get('date_time_input_format')).toBe('best_effort')
      expect(call?.headers['x-clickhouse-user']).toBe('writer')
      expect(call?.headers['x-clickhouse-key']).toBe('secret')

      const rows = (call?.body ?? '')
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({
        attributes: { 'context.requestId': 'r1', status: '200' },
        level: 'INFO',
        message: 'hello'
      })
      expect(rows[1]).toMatchObject({ level: 'ERROR', message: 'boom' })
    } finally {
      stub.restore()
      restoreEnv()
    }
  })

  test('reads connection settings from the environment', async () => {
    const restoreEnv = stubEnv({
      ...CLEAR_ENV,
      CLICKHOUSE_DATABASE: 'observability',
      CLICKHOUSE_TABLE: 'app_logs',
      CLICKHOUSE_URL: 'http://clickhouse:8123/'
    })
    const stub = stubFetch()
    try {
      const transport = createClickHouseTransport()
      transport.log('INFO', 'hi')
      await transport.flush()

      const url = new URL(stub.calls[0]?.url ?? '')
      expect(url.origin).toBe('http://clickhouse:8123')
      expect(url.searchParams.get('query')).toBe(
        'INSERT INTO observability.app_logs FORMAT JSONEachRow'
      )
    } finally {
      stub.restore()
      restoreEnv()
    }
  })
})
