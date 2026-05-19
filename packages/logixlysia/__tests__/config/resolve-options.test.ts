import { describe, expect, test } from 'bun:test'

import { resolveOptions } from '../../src/config/resolve-options'

describe('resolveOptions', () => {
  test('prod preset enables autoRedact and disables banner', () => {
    const resolved = resolveOptions({ preset: 'prod' })

    expect(resolved.config?.autoRedact).toBe(true)
    expect(resolved.config?.showStartupMessage).toBe(false)
    expect(resolved.config?.showContextTree).toBe(false)
  })

  test('explicit config overrides preset', () => {
    const resolved = resolveOptions({
      preset: 'prod',
      config: {
        autoRedact: false,
        showStartupMessage: true
      }
    })

    expect(resolved.config?.autoRedact).toBe(false)
    expect(resolved.config?.showStartupMessage).toBe(true)
  })

  test('dev preset enables pretty print', () => {
    const resolved = resolveOptions({ preset: 'dev' })

    expect(resolved.config?.pino?.prettyPrint).toBe(true)
    expect(resolved.config?.showStartupMessage).toBe(true)
  })
})
