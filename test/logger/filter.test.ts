import { describe, expect, it } from 'bun:test'

import { filterLog } from '~/logger/filter'
import { LogLevel, Options } from '~/types'

describe('filterLog', () => {
  const logLevel: LogLevel = 'info'
  const status = 200
  const method = 'GET'

  it('should return true if no filter is provided', () => {
    expect(filterLog(logLevel, status, method)).toBe(true)
  })

  it('should filter by log level (single value)', () => {
    const options: Options = { config: { logFilter: { level: 'error' } } }
    expect(filterLog(logLevel, status, method, options)).toBe(false)
  })

  it('should filter by log level (array)', () => {
    const options: Options = {
      config: { logFilter: { level: ['error', 'info'] } }
    }
    expect(filterLog(logLevel, status, method, options)).toBe(true)
  })

  it('should filter by status (single value)', () => {
    const options: Options = { config: { logFilter: { status: 404 } } }
    expect(filterLog(logLevel, status, method, options)).toBe(false)
  })

  it('should filter by status (array)', () => {
    const options: Options = { config: { logFilter: { status: [200, 404] } } }
    expect(filterLog(logLevel, status, method, options)).toBe(true)
  })

  it('should filter by method (single value)', () => {
    const options: Options = { config: { logFilter: { method: 'POST' } } }
    expect(filterLog(logLevel, status, method, options)).toBe(false)
  })

  it('should filter by method (array)', () => {
    const options: Options = {
      config: { logFilter: { method: ['GET', 'POST'] } }
    }
    expect(filterLog(logLevel, status, method, options)).toBe(true)
  })

  it('should return false if any filter condition is not met', () => {
    const options: Options = {
      config: { logFilter: { level: 'info', status: 404, method: 'POST' } }
    }
    expect(filterLog(logLevel, status, method, options)).toBe(false)
  })

  it('should return true if all filter conditions are met', () => {
    const options: Options = {
      config: { logFilter: { level: 'info', status: 200, method: 'GET' } }
    }
    expect(filterLog(logLevel, status, method, options)).toBe(true)
  })
})
