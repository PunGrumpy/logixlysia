import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Elysia } from 'elysia'
import { flushLogixlysia, logixlysia } from '../../src'
import type { Options } from '../../src/interfaces'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const ISO = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`
const DURATION = String.raw`\d+\.\d{2}ms`
const ANSI_ESCAPE = '\u001B'

interface Handler {
  handle: (request: Request) => Response | Promise<Response>
}

const writeLines = async (
  createApp: (options: Options) => Handler,
  config: NonNullable<Options['config']> = {}
): Promise<string[]> => {
  const dir = await createTempDir()
  try {
    const logFilePath = path.join(dir, 'app.log')
    const options: Options = {
      config: {
        disableInternalLogger: true,
        logFilePath,
        showStartupMessage: false,
        ...config
      }
    }
    const app = createApp(options)
    await app.handle(new Request('http://localhost/ok'))
    await app.handle(new Request('http://localhost/boom'))
    await app.handle(new Request('http://localhost/info?a=1'))
    await flushLogixlysia(options)
    const content = await readFile(logFilePath, 'utf-8')
    return content.split('\n').filter(line => line.length > 0)
  } finally {
    await removeTempDir(dir)
  }
}

const routes = (options: Options): Handler =>
  new Elysia()
    .use(logixlysia(options))
    .get('/ok', () => 'ok')
    .get('/boom', () => {
      throw new Error('Payment failed')
    })
    .get('/info', ({ log }) => {
      log.info('hello', { password: 'hunter2', userId: 7 })
      return 'x'
    })

describe('file log line', () => {
  test('a 200 response is one line: ISO timestamp, level, method, path, status, duration', async () => {
    const lines = await writeLines(routes)

    expect(lines[0]).toMatch(
      new RegExp(`^${ISO} INFO GET /ok 200 ${DURATION}$`, 'u')
    )
  })

  test('a 500 response carries its status and the error message', async () => {
    const lines = await writeLines(routes)

    expect(lines[1]).toMatch(
      new RegExp(`^${ISO} ERROR GET /boom 500 ${DURATION} Payment failed$`, 'u')
    )
  })

  test('a log.info call writes its message and context on the same line, redacted', async () => {
    const lines = await writeLines(routes, { autoRedact: true })

    expect(lines).toHaveLength(3)
    expect(lines[2]).toMatch(
      new RegExp(
        `^${ISO} INFO GET /info - ${DURATION} hello \\{"password":"\\[REDACTED\\]","userId":7\\}$`,
        'u'
      )
    )
    expect(lines.join('\n')).not.toContain('hunter2')
  })

  test('never writes an ANSI escape, even when colors are on and the input carries one', async () => {
    const lines = await writeLines(
      options =>
        new Elysia().use(logixlysia(options)).get('/ok', ({ log }) => {
          log.info(`red${ANSI_ESCAPE}[31m`, { note: `x${ANSI_ESCAPE}[0m` })
          return 'ok'
        }),
      { useColors: true }
    )

    expect(lines.length).toBeGreaterThan(0)
    expect(lines.join('\n')).not.toContain(ANSI_ESCAPE)
  })
})
