import { describe, expect, test } from 'bun:test'
import type { Options } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { spyConsole } from '../_helpers/console'
import { createMockRequest } from '../_helpers/request'

const ESCAPE = '\u001b'

describe('console path sanitization', () => {
  test('sanitizes a forged-log-line message from a thrown error', () => {
    const options: Options = {
      config: {
        disableFileLogging: true,
        useColors: false
      }
    }
    const logger = createLogger(options)
    const request = createMockRequest('http://localhost/test')
    const store = { beforeTime: BigInt(0) }

    const { spies, restore } = spyConsole(['error'])

    logger.handleHttpError(
      request,
      new Error(`boom\nERROR forged 200 0ms${ESCAPE}[31m`),
      store
    )

    expect(spies.error).toHaveBeenCalledTimes(1)
    const [output] = spies.error.mock.calls[0] as [string]

    expect(output).toContain('\\n')
    expect(output).not.toContain(ESCAPE)

    restore()
  })

  test('sanitizes a custom log message containing escape sequences', () => {
    const options: Options = {
      config: {
        disableFileLogging: true,
        useColors: false
      }
    }
    const logger = createLogger(options)
    const request = createMockRequest('http://localhost/test')

    const { spies, restore } = spyConsole(['info'])

    logger.info(request, `a${ESCAPE}[2Jb`)

    expect(spies.info).toHaveBeenCalledTimes(1)
    const [output] = spies.info.mock.calls[0] as [string]

    expect(output).not.toContain(ESCAPE)
    expect(output).toContain('a[2Jb')

    restore()
  })
})
