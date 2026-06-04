import { describe, expect, test } from 'bun:test'

import {
  getOrCreateRequestId,
  type ResolvedRequestIdConfig,
  resolveRequestIdConfig
} from '../../src/middleware/request-id'

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('resolveRequestIdConfig', () => {
  test('returns null when undefined', () => {
    expect(resolveRequestIdConfig(undefined)).toBeNull()
  })

  test('returns null when false', () => {
    expect(resolveRequestIdConfig(false)).toBeNull()
  })

  test('returns default config when true', () => {
    const config = resolveRequestIdConfig(true)
    expect(config).not.toBeNull()
    expect(config?.enabled).toBe(true)
    expect(config?.header).toBe('X-Request-Id')
    expect(typeof config?.generator).toBe('function')
    // default generator produces UUID v4 format
    const id = config?.generator?.()
    expect(id).toMatch(UUID_V4_REGEX)
  })

  test('returns null when object has enabled: false', () => {
    expect(resolveRequestIdConfig({ enabled: false })).toBeNull()
  })

  test('uses custom header name', () => {
    const config = resolveRequestIdConfig({ header: 'X-Correlation-Id' })
    expect(config).not.toBeNull()
    expect(config?.header).toBe('X-Correlation-Id')
  })

  test('trims whitespace from header name', () => {
    const config = resolveRequestIdConfig({ header: '  X-Trace-Id  ' })
    expect(config?.header).toBe('X-Trace-Id')
  })

  test('falls back to default header when empty string', () => {
    const config = resolveRequestIdConfig({ header: '  ' })
    expect(config?.header).toBe('X-Request-Id')
  })

  test('uses custom generator', () => {
    const config = resolveRequestIdConfig({
      generator: () => 'custom-id-123'
    })
    expect(config).not.toBeNull()
    expect(config?.generator?.()).toBe('custom-id-123')
  })

  test('defaults enabled to true when object is provided without enabled field', () => {
    const config = resolveRequestIdConfig({})
    expect(config).not.toBeNull()
    expect(config?.enabled).toBe(true)
  })
})

describe('getOrCreateRequestId', () => {
  const defaultConfig: ResolvedRequestIdConfig = {
    enabled: true,
    header: 'X-Request-Id',
    generator: () => 'generated-uuid'
  }

  test('generates new ID when no header present', () => {
    const request = new Request('http://localhost/test')
    const id = getOrCreateRequestId(request, defaultConfig)
    expect(id).toBe('generated-uuid')
  })

  test('honors existing X-Request-Id header', () => {
    const request = new Request('http://localhost/test', {
      headers: { 'X-Request-Id': 'existing-id-from-gateway' }
    })
    const id = getOrCreateRequestId(request, defaultConfig)
    expect(id).toBe('existing-id-from-gateway')
  })

  test('uses custom header name to read existing ID', () => {
    const config: ResolvedRequestIdConfig = {
      enabled: true,
      header: 'X-Correlation-Id',
      generator: () => 'fallback'
    }
    const request = new Request('http://localhost/test', {
      headers: { 'X-Correlation-Id': 'corr-456' }
    })
    const id = getOrCreateRequestId(request, config)
    expect(id).toBe('corr-456')
  })

  test('generates ID when custom header is absent', () => {
    const config: ResolvedRequestIdConfig = {
      enabled: true,
      header: 'X-Correlation-Id',
      generator: () => 'new-corr-id'
    }
    const request = new Request('http://localhost/test')
    const id = getOrCreateRequestId(request, config)
    expect(id).toBe('new-corr-id')
  })

  test('uses custom generator function', () => {
    let counter = 0
    const config: ResolvedRequestIdConfig = {
      enabled: true,
      header: 'X-Request-Id',
      generator: () => `req-${++counter}`
    }
    const req1 = new Request('http://localhost/1')
    const req2 = new Request('http://localhost/2')
    expect(getOrCreateRequestId(req1, config)).toBe('req-1')
    expect(getOrCreateRequestId(req2, config)).toBe('req-2')
  })
})
