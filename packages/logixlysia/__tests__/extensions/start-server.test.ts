import { describe, expect, test } from 'bun:test'
import { startServer } from '../../src/extensions'
import type { Options } from '../../src/interfaces'
import { spyConsole } from '../_helpers/console'

describe('startServer', () => {
  test('renders banner by default', () => {
    const { spies, restore } = spyConsole(['log'])

    const options: Options = {}
    startServer(
      { hostname: 'localhost', port: 3000, protocol: 'http' },
      options
    )

    expect(spies.log).toHaveBeenCalledTimes(1)
    const output = spies.log.mock.calls[0]?.[0]
    expect(String(output)).toContain('┌')
    expect(String(output)).toContain('🦊')
    expect(String(output)).toContain('http://localhost:3000')
    expect(String(output)).toContain('logixlysia v')

    restore()
  })

  test('renders simple message when configured', () => {
    const { spies, restore } = spyConsole(['log'])

    const options: Options = { config: { startupMessageFormat: 'simple' } }
    startServer(
      { hostname: 'localhost', port: 3000, protocol: 'http' },
      options
    )

    expect(spies.log).toHaveBeenCalledTimes(1)
    const output = spies.log.mock.calls[0]?.[0]
    expect(String(output)).toContain(
      '🦊 Elysia is running at http://localhost:3000'
    )
    expect(String(output)).not.toContain('┌')

    restore()
  })

  test('does nothing when showStartupMessage is false', () => {
    const { spies, restore } = spyConsole(['log'])

    const options: Options = { config: { showStartupMessage: false } }
    startServer(
      { hostname: 'localhost', port: 3000, protocol: 'http' },
      options
    )

    expect(spies.log).not.toHaveBeenCalled()

    restore()
  })

  test('does nothing when server info is incomplete', () => {
    const { spies, restore } = spyConsole(['log'])

    const options: Options = {}
    startServer({ hostname: 'localhost', port: 3000, protocol: null }, options)

    expect(spies.log).not.toHaveBeenCalled()

    restore()
  })

  test('prints the banner without a URL when there is no server', () => {
    const { spies, restore } = spyConsole(['log'])

    startServer(undefined, {})

    expect(spies.log).toHaveBeenCalledTimes(1)
    const output = String(spies.log.mock.calls[0]?.[0])
    expect(output).toContain('┌')
    expect(output).toContain('logixlysia v')
    expect(output).not.toContain('http')

    restore()
  })

  test('prints the simple message without a URL when there is no server', () => {
    const { spies, restore } = spyConsole(['log'])

    startServer(undefined, { config: { startupMessageFormat: 'simple' } })

    expect(spies.log).toHaveBeenCalledTimes(1)
    expect(spies.log.mock.calls[0]?.[0]).toBe('🦊 Elysia is running')

    restore()
  })

  test('prints nothing without a server when showStartupMessage is false', () => {
    const { spies, restore } = spyConsole(['log'])

    startServer(undefined, { config: { showStartupMessage: false } })

    expect(spies.log).not.toHaveBeenCalled()

    restore()
  })

  test('centres the version row when there is no URL row', () => {
    const { spies, restore } = spyConsole(['log'])

    startServer(undefined, {})

    const output = String(spies.log.mock.calls[0]?.[0])
    const row = output.split('\n').find(line => line.includes('logixlysia v'))
    expect(row).toContain('logixlysia v')
    const inner = row?.split('│')[1] ?? ''
    const left = inner.length - inner.trimStart().length
    const right = inner.length - inner.trimEnd().length
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)

    restore()
  })
})
