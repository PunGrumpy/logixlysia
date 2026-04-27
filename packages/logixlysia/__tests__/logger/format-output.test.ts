import { describe, expect, test } from 'bun:test'
import type { Options } from '../../src/interfaces'
import {
  buildContextTreeLines,
  formatDuration,
  formatLogOutput
} from '../../src/logger/create-logger'
import { redactRequest } from '../../src/utils/redact'
import { createMockRequest } from '../_helpers/request'

describe('formatDuration', () => {
  test('formats sub-second requests as ms', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(12)).toBe('12ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  test('formats 1s+ with s suffix', () => {
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(10_500)).toBe('11s')
  })

  test('formats fractional ms under 1ms', () => {
    expect(formatDuration(0.34)).toBe('0.34ms')
  })
})

describe('formatLogOutput', () => {
  const baseOptions = (overrides?: Options): Options => ({
    config: {
      useColors: false,
      ...overrides?.config
    }
  })

  test('includes path, status, and icon in main line', () => {
    const request = createMockRequest('http://localhost/api/hello')
    const store = { beforeTime: BigInt(0) }
    const out = formatLogOutput({
      level: 'INFO',
      request,
      data: { status: 200 },
      store,
      options: baseOptions()
    })

    expect(out.main).toContain('/api/hello')
    expect(out.main).toContain('200')
    expect(out.main).toContain('GET')
    expect(out.main).toContain('🦊')
    expect(out.contextLines).toEqual([])
  })

  test('appends context tree when context object is non-empty', () => {
    const request = createMockRequest('http://localhost/x')
    const store = { beforeTime: BigInt(0) }
    const out = formatLogOutput({
      level: 'INFO',
      request,
      data: {
        status: 200,
        context: { userId: 42, feature: 'test' }
      },
      store,
      options: baseOptions()
    })

    expect(out.contextLines.length).toBe(2)
    expect(out.contextLines[0]).toContain('├─')
    expect(out.contextLines[0]).toContain('userId')
    expect(out.contextLines[0]).toContain('42')
    expect(out.contextLines[1]).toContain('└─')
    expect(out.contextLines[1]).toContain('feature')
    expect(out.main).not.toContain('"userId"')
  })

  test('inlines JSON context when showContextTree is false', () => {
    const request = createMockRequest('http://localhost/x')
    const store = { beforeTime: BigInt(0) }
    const out = formatLogOutput({
      level: 'INFO',
      request,
      data: {
        status: 200,
        context: { a: 1 }
      },
      store,
      options: baseOptions({
        config: {
          useColors: false,
          showContextTree: false,
          customLogFormat: '{pathname} {context}'
        }
      })
    })

    expect(out.contextLines).toEqual([])
    expect(out.main).toContain('{"a":1}')
  })

  test('includes service token when configured', () => {
    const request = createMockRequest('http://localhost/')
    const store = { beforeTime: BigInt(0) }
    const out = formatLogOutput({
      level: 'INFO',
      request,
      data: { status: 200 },
      store,
      options: baseOptions({
        config: { useColors: false, service: 'my-api' }
      })
    })

    expect(out.main).toContain('[my-api]')
  })

  test('includes statusText token in custom format', () => {
    const request = createMockRequest('http://localhost/not-found')
    const store = { beforeTime: BigInt(0) }
    const out = formatLogOutput({
      level: 'INFO',
      request,
      data: { status: 404 },
      store,
      options: baseOptions({
        config: {
          useColors: false,
          customLogFormat: '{status} {statusText} {pathname}'
        }
      })
    })

    expect(out.main).toContain('404')
    expect(out.main).toContain('Not Found')
    expect(out.main).toContain('/not-found')
  })

  test('redacted request masks email in pathname and IP in {ip} token', () => {
    const request = createMockRequest(
      'http://localhost/user/test@example.com/x',
      {
        headers: { 'x-forwarded-for': '192.168.1.1' }
      }
    )
    const redacted = redactRequest(request)
    const store = { beforeTime: BigInt(0) }
    const out = formatLogOutput({
      level: 'INFO',
      request: redacted,
      data: { status: 200 },
      store,
      options: baseOptions({
        config: {
          useColors: false,
          ip: true,
          customLogFormat: '{pathname} {ip}'
        }
      })
    })

    expect(out.main).toContain('/user/[REDACTED]/x')
    expect(out.main).not.toContain('test@example.com')
    expect(out.main).toContain('[REDACTED]')
    expect(out.main).not.toContain('192.168.1.1')
  })

  test('speed token appears when duration exceeds verySlowThreshold', () => {
    const request = createMockRequest('http://localhost/slow')
    const store = {
      beforeTime: process.hrtime.bigint() - BigInt(1_200_000_000)
    }
    const out = formatLogOutput({
      level: 'INFO',
      request,
      data: { status: 200 },
      store,
      options: baseOptions({
        config: {
          useColors: false,
          verySlowThreshold: 1000,
          slowThreshold: 500
        }
      })
    })

    expect(out.main).toContain('⚡ slow')
  })
})

describe('buildContextTreeLines', () => {
  test('adds error line for ERROR level with error field', () => {
    const lines = buildContextTreeLines(
      'ERROR',
      { error: new Error('nope') },
      { config: { useColors: false } }
    )

    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('error')
    expect(lines[0]).toContain('nope')
  })

  test('expands nested context when contextDepth > 1', () => {
    const lines = buildContextTreeLines(
      'INFO',
      { context: { user: { id: 7, name: 'a' } } },
      { config: { useColors: false, contextDepth: 2 } }
    )

    expect(lines.some(l => l.includes('user.id'))).toBe(true)
    expect(lines.some(l => l.includes('user.name'))).toBe(true)
  })
})
