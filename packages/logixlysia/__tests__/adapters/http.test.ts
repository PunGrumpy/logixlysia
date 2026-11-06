import { describe, expect, test } from 'bun:test'
import type { LogEntry } from '../../src/http'
import { createHttpTransport, entryText } from '../../src/http'
import { stubFetch } from './helpers'

const URL = 'http://collector.test/ingest'
const HEADERS = { 'content-type': 'text/plain', 'x-token': 'secret' }

const joinMessages = (entries: LogEntry[]): string =>
  entries.map(entry => entry.message).join('|')

const entry = (message: string, meta: Record<string, unknown>): LogEntry => ({
  level: 'INFO',
  message,
  meta,
  timestamp: new Date()
})

describe('logixlysia/http', () => {
  test('sends one POST with both entries, the headers and the built body', async () => {
    const stub = stubFetch()
    try {
      const transport = createHttpTransport({
        body: joinMessages,
        headers: HEADERS,
        name: 'custom',
        options: {},
        url: URL
      })
      transport.log('INFO', 'first', {})
      transport.log('ERROR', 'second', {})
      await transport.flush()

      expect(stub.calls).toHaveLength(1)
      expect(stub.calls[0]).toMatchObject({
        body: 'first|second',
        headers: HEADERS,
        method: 'POST',
        url: URL
      })
    } finally {
      stub.restore()
    }
  })

  test('retries a 503 and delivers the batch once', async () => {
    const stub = stubFetch([{ status: 503 }, { status: 200 }])
    try {
      const transport = createHttpTransport({
        body: joinMessages,
        headers: HEADERS,
        name: 'custom',
        options: {},
        url: URL
      })
      transport.log('INFO', 'only', {})
      await transport.flush()

      expect(stub.calls.map(call => call.body)).toEqual(['only', 'only'])
    } finally {
      stub.restore()
    }
  })

  test('passes options through to the queue and the transport', async () => {
    const stub = stubFetch([{ status: 500 }])
    try {
      const dropped: { count: number; reason: string }[] = []
      const transport = createHttpTransport({
        body: joinMessages,
        headers: HEADERS,
        name: 'custom',
        options: {
          minLevel: 'WARNING',
          onDropped: info => dropped.push(info),
          retries: 0
        },
        url: URL
      })
      transport.log('ERROR', 'lost', {})

      await expect(transport.flush()).rejects.toThrow('HTTP 500')
      expect(dropped).toEqual([{ count: 1, reason: 'send-failed' }])
      expect(transport.minLevel).toBe('WARNING')
    } finally {
      stub.restore()
    }
  })

  test('entryText names an access line by method and path', () => {
    expect(entryText(entry('hello', {}))).toBe('hello')
    expect(
      entryText(
        entry('', { request: { method: 'POST', url: 'http://host/x?a=1' } })
      )
    ).toBe('POST /x')
  })

  test('a throwing body reports send-failed and never throws from log', async () => {
    const stub = stubFetch()
    try {
      const dropped: { count: number; reason: string }[] = []
      const transport = createHttpTransport({
        body: () => {
          throw new Error('cannot serialize')
        },
        headers: HEADERS,
        name: 'custom',
        options: { onDropped: info => dropped.push(info) },
        url: URL
      })

      expect(() => transport.log('INFO', 'x', {})).not.toThrow()
      await expect(transport.flush()).rejects.toThrow('cannot serialize')
      expect(dropped).toEqual([{ count: 1, reason: 'send-failed' }])
      expect(stub.calls).toHaveLength(0)
    } finally {
      stub.restore()
    }
  })
})
