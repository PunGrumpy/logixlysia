import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Elysia } from 'elysia'
import { flushLogixlysia, logixlysia } from '../../src'
import type { Options } from '../../src/interfaces'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const ISO = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`

const routes = (options: Options) =>
  new Elysia()
    .use(logixlysia(options))
    .get('/ok', () => 'ok')
    .get('/hello', ({ log }) => {
      log.info('hello', { a: 1 })
      return 'ok'
    })
    .get('/multiline', ({ log }) => {
      log.info('a\nb')
      return 'ok'
    })
    .get('/boom', () => {
      throw new Error('boom')
    })
    .get('/secret', ({ log }) => {
      log.info('x', { password: 'hunter2' })
      return 'ok'
    })

/** The log file after one request, split into its non-empty lines. */
const fileAfter = async (
  pathname: string,
  config: NonNullable<Options['config']> = {}
): Promise<{ content: string; lines: string[] }> => {
  const dir = await createTempDir()
  try {
    const logFilePath = path.join(dir, 'app.log')
    const options: Options = {
      config: {
        disableInternalLogger: true,
        fileFormat: 'json',
        logFilePath,
        showStartupMessage: false,
        ...config
      }
    }
    const app = routes(options)
    await app.handle(new Request(`http://localhost${pathname}`))
    await flushLogixlysia(options, { close: true })
    const content = await readFile(logFilePath, 'utf-8')
    return {
      content,
      lines: content.split('\n').filter(line => line.length > 0)
    }
  } finally {
    await removeTempDir(dir)
  }
}

const parse = (line: string | undefined): Record<string, unknown> =>
  JSON.parse(line ?? '') as Record<string, unknown>

describe("fileFormat: 'json'", () => {
  test('a 200 response is one JSON line with timestamp and level first', async () => {
    const { lines } = await fileAfter('/ok')

    expect(lines).toHaveLength(1)
    const record = parse(lines[0])
    expect(record.level).toBe('INFO')
    expect(record.message).toBe('')
    expect(record.request).toEqual({
      method: 'GET',
      url: 'http://localhost/ok'
    })
    expect(record.status).toBe(200)
    expect(record.durationMs).toBeNumber()
    expect(Number.isNaN(new Date(String(record.timestamp)).getTime())).toBe(
      false
    )
    expect(Object.keys(record).slice(0, 2)).toEqual(['timestamp', 'level'])
  })

  test('a log.info call writes its message and context where the JSON console line does', async () => {
    const { lines } = await fileAfter('/hello')

    expect(lines).toHaveLength(2)
    const record = parse(lines[0])
    expect(record.message).toBe('hello')
    expect(record.context).toEqual({ a: 1 })
  })

  test('a message with a line break stays on one line and round-trips', async () => {
    const { lines } = await fileAfter('/multiline')

    expect(lines).toHaveLength(2)
    expect(parse(lines[0]).message).toBe('a\nb')
  })

  test('a thrown error is an ERROR line with status 500 and the error', async () => {
    const { lines } = await fileAfter('/boom')

    expect(lines).toHaveLength(1)
    const record = parse(lines[0])
    expect(record.level).toBe('ERROR')
    expect(record.status).toBe(500)
    expect(record.error).toMatchObject({ message: 'boom' })
  })

  test('autoRedact masks a secret before it reaches the file', async () => {
    const { content, lines } = await fileAfter('/secret', {
      autoRedact: true
    })

    expect(content).not.toContain('hunter2')
    expect(parse(lines[0]).context).toEqual({ password: '[REDACTED]' })
  })

  test('the configured service is the third key', async () => {
    const { lines } = await fileAfter('/ok', { service: 'my-api' })

    const record = parse(lines[0])
    expect(Object.keys(record)[2]).toBe('service')
    expect(record.service).toBe('my-api')
  })

  test('without fileFormat the file keeps the text line', async () => {
    const { lines } = await fileAfter('/ok', { fileFormat: undefined })

    expect(lines[0]).toMatch(new RegExp(`^${ISO} INFO GET /ok 200 `, 'u'))
  })
})
