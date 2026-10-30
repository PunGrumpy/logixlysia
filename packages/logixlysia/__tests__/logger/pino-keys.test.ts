import { expect, test } from 'bun:test'
import pino from 'pino'
import { createLogger } from '../../src/logger'

const capturingFactory = (lines: string[]): typeof pino =>
  ((opts: pino.LoggerOptions) =>
    pino(opts, {
      write: (line: string) => {
        lines.push(line)
      }
    })) as unknown as typeof pino

test('logger.pino keeps pino default msg and err keys when none are set', () => {
  const lines: string[] = []
  const logger = createLogger(
    { config: { pino: { level: 'info' } } },
    capturingFactory(lines)
  )

  logger.pino.info('hello')
  logger.pino.error(new Error('boom'))

  const [info, error] = lines.map(line => JSON.parse(line))
  expect(info.msg).toBe('hello')
  expect(info).not.toHaveProperty('undefined')
  expect(error.err?.message).toBe('boom')
})

test('logger.pino keeps pino defaults when keys are explicitly undefined', () => {
  const lines: string[] = []
  const logger = createLogger(
    { config: { pino: { errorKey: undefined, messageKey: undefined } } },
    capturingFactory(lines)
  )

  logger.pino.info('hello')
  logger.pino.error(new Error('boom'))

  const [info, error] = lines.map(line => JSON.parse(line))
  expect(info.msg).toBe('hello')
  expect(error.err?.message).toBe('boom')
})

test('logger.pino honours custom messageKey and errorKey', () => {
  const lines: string[] = []
  const logger = createLogger(
    { config: { pino: { errorKey: 'error', messageKey: 'message' } } },
    capturingFactory(lines)
  )

  logger.pino.info('hello')
  logger.pino.error(new Error('boom'))

  const [info, error] = lines.map(line => JSON.parse(line))
  expect(info.message).toBe('hello')
  expect(error.error?.message).toBe('boom')
})
