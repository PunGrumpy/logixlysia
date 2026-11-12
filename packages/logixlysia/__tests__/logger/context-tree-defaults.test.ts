import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { LogixlysiaConfig } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { spyConsole } from '../_helpers/console'
import { createMockRequest } from '../_helpers/request'
import { waitFor } from '../_helpers/wait-for'

const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')

const setIsTTY = (value: boolean) => {
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value
  })
}

afterEach(() => {
  if (originalIsTTY) {
    Object.defineProperty(process.stdout, 'isTTY', originalIsTTY)
  } else {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  }
})

const treeFor = (
  context: Record<string, unknown>,
  config: LogixlysiaConfig = {}
): string[] => {
  const { spies, restore } = spyConsole()
  try {
    createLogger({
      config: { disableFileLogging: true, useColors: false, ...config }
    }).info(createMockRequest('http://localhost/hello'), 'hi', context)
    return String(spies.info.mock.calls[0]?.[0]).split('\n').slice(1)
  } finally {
    restore()
  }
}

const user = { id: 'usr_123', org: { id: 'org_9', plan: { tier: 'pro' } } }
const LONG = 'x'.repeat(450)

describe('context tree depth', () => {
  test('expands one nested level by default', () => {
    setIsTTY(false)

    expect(treeFor({ user })).toEqual([
      '  ├─ user.id  usr_123',
      '  └─ user.org  {"id":"org_9","plan":{"tier":"pro"}}'
    ])
  })

  test('an explicit contextDepth wins', () => {
    setIsTTY(false)

    expect(treeFor({ user }, { contextDepth: 1 })).toEqual([
      '  └─ user  {"id":"usr_123","org":{"id":"org_9","plan":{"tier":"pro"}}}'
    ])
  })
})

describe('long string values', () => {
  test('a TTY cuts a long string to 200 characters and states its length', () => {
    setIsTTY(true)

    expect(treeFor({ note: LONG })).toEqual([
      `  └─ note  ${'x'.repeat(200)}… (450 chars)`
    ])
  })

  test('a TTY prints a 200-character string whole', () => {
    setIsTTY(true)
    const exact = 'y'.repeat(200)

    expect(treeFor({ note: exact })).toEqual([`  └─ note  ${exact}`])
  })

  test('a non-TTY stdout prints the whole string', () => {
    setIsTTY(false)

    expect(treeFor({ note: LONG })).toEqual([`  └─ note  ${LONG}`])
  })

  test('transport output keeps the whole string on a TTY', async () => {
    setIsTTY(true)
    const transport = mock(
      (_level: unknown, _message: unknown, _meta?: unknown) => {}
    )
    const { restore } = spyConsole()
    try {
      createLogger({
        config: { disableFileLogging: true, transports: [{ log: transport }] }
      }).info(createMockRequest('http://localhost/hello'), 'hi', { note: LONG })
    } finally {
      restore()
    }
    await waitFor(() => transport.mock.calls.length > 0)

    expect(JSON.stringify(transport.mock.calls[0]?.[2])).toContain(LONG)
  })
})
