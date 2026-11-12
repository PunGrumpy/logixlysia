import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from '../../src/logger'
import { spyConsole } from '../_helpers/console'
import { createTempDir, removeTempDir } from '../_helpers/tmp'
import { waitFor } from '../_helpers/wait-for'

const FILE_LINE =
  /INFO GET \/users\/\[REDACTED\]\?token=redacted&page=2 - \S+ hello\n$/u
const SECRETS = ['203.0.113.7', 'abc.def.ghi', 's3cr3t', 'user@example.com']

let dir = ''
beforeEach(async () => {
  dir = await createTempDir()
})
afterEach(async () => {
  await removeTempDir(dir)
})

test('every sink of the prod preset sees the request redacted', async () => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {}
  )
  const logFilePath = path.join(dir, 'app.log')
  const logger = createLogger({
    config: {
      customLogFormat: '{method} {pathname} {ip}',
      ip: true,
      logFilePath,
      logFilter: { level: ['INFO'] },
      logQueryParams: true,
      transports: [{ log: transport }]
    },
    preset: 'prod'
  })
  const request = new Request(
    'http://localhost/users/user@example.com?token=abc.def.ghi&page=2',
    {
      headers: {
        authorization: 'Bearer abc.def.ghi',
        cookie: 'session=s3cr3t',
        'x-forwarded-for': '203.0.113.7, 10.0.0.2'
      }
    }
  )
  const { spies, restore } = spyConsole(['info'])

  try {
    logger.info(request, 'hello')
  } finally {
    restore()
  }

  const [line] = spies.info.mock.calls[0] as [string]
  expect(line).toBe(
    'GET     /users/[REDACTED]?token=redacted&page=2 [REDACTED]'
  )

  const meta = transport.mock.calls[0]?.[2] as { request: unknown }
  expect(meta.request).toEqual({
    method: 'GET',
    url: 'http://localhost/users/[REDACTED]?token=redacted&page=2'
  })

  const readLog = (): string =>
    existsSync(logFilePath) ? readFileSync(logFilePath, 'utf-8') : ''
  await waitFor(() => readLog() !== '')
  const file = readLog()
  expect(file).toMatch(FILE_LINE)

  for (const output of [line, JSON.stringify(meta), file]) {
    for (const secret of SECRETS) {
      expect(output).not.toContain(secret)
    }
  }
  expect(request.headers.get('authorization')).toBe('Bearer abc.def.ghi')
})
