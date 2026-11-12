import { describe, expect, spyOn, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { resolveSampling } from '../../src/sampling'
import type { RequestOutcome } from '../../src/sampling'

const ROLL_INSIDE_FIFTY_PERCENT = 0.1
const ROLL_OUTSIDE_FIFTY_PERCENT = 0.9
const ROLL_INSIDE_TEN_PERCENT = 0.05
const ROLL_OUTSIDE_TEN_PERCENT = 0.5
const SERVER_ERROR = 500
const CUSTOM_LOGS_PER_REQUEST = 3
const ACCESS_LINES_PER_REQUEST = 1

const countingRandom = (values: number[]) => {
  let calls = 0
  const random = () => {
    const value = values[Math.min(calls, values.length - 1)] as number
    calls += 1
    return value
  }
  return { calls: () => calls, random }
}

const outcome = (partial: Partial<RequestOutcome> = {}): RequestOutcome => ({
  context: {},
  durationMs: 0,
  pathname: '/',
  status: 200,
  ...partial
})

const requestLines = async (
  firstRoll: number,
  laterRoll: number
): Promise<string[]> => {
  const { random: nextRoll } = countingRandom([firstRoll, laterRoll])
  const random = spyOn(Math, 'random').mockImplementation(nextRoll)
  try {
    const lines: string[] = []
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            sampling: { head: { INFO: 10 } },
            transports: [
              {
                log: (_level, message) => {
                  lines.push(message)
                }
              }
            ]
          }
        })
      )
      .get('/three', ({ log }) => {
        log.info('one')
        log.info('two')
        log.info('three')
        return 'ok'
      })

    await app.handle(new Request('http://localhost/three'))
    return lines
  } finally {
    random.mockRestore()
  }
}

describe('head sampling rolls once per request', () => {
  test('keeps every record of a request that rolled inside the rate', () => {
    const { calls, random } = countingRandom([ROLL_INSIDE_FIFTY_PERCENT])
    const sampling = resolveSampling({ head: { INFO: 50 } }, random)
    const key = {}
    sampling?.begin(key)

    expect([
      sampling?.decide('INFO', key),
      sampling?.decide('INFO', key),
      sampling?.decide('INFO', key)
    ]).toEqual(['keep', 'keep', 'keep'])
    expect(calls()).toBe(1)
  })

  test('drops every record of a request that rolled outside the rate', () => {
    const { calls, random } = countingRandom([ROLL_OUTSIDE_FIFTY_PERCENT])
    const sampling = resolveSampling({ head: { INFO: 50 } }, random)
    const key = {}
    sampling?.begin(key)

    expect([
      sampling?.decide('INFO', key),
      sampling?.decide('INFO', key),
      sampling?.decide('INFO', key)
    ]).toEqual(['drop', 'drop', 'drop'])
    expect(calls()).toBe(1)
  })

  test('keeps a low-rate level only on requests that keep the higher-rate level', () => {
    const sampling = resolveSampling(
      { head: { DEBUG: 1, INFO: 10 } },
      () => ROLL_INSIDE_TEN_PERCENT
    )
    const key = {}
    sampling?.begin(key)

    expect(sampling?.decide('INFO', key)).toBe('keep')
    expect(sampling?.decide('DEBUG', key)).toBe('drop')
  })

  test('rolls per record for a key that never began', () => {
    const sampling = resolveSampling(
      { head: { INFO: 50 } },
      countingRandom([ROLL_INSIDE_FIFTY_PERCENT, ROLL_OUTSIDE_FIFTY_PERCENT])
        .random
    )
    const key = {}

    expect(sampling?.decide('INFO', key)).toBe('keep')
    expect(sampling?.decide('INFO', key)).toBe('drop')
  })

  test('still lets a tail rule rescue the records of a dropped request', () => {
    const sampling = resolveSampling(
      { head: { INFO: 10 }, tail: { status: SERVER_ERROR } },
      () => ROLL_OUTSIDE_TEN_PERCENT
    )
    const key = {}
    sampling?.begin(key)

    expect(sampling?.decide('INFO', key)).toBe('buffer')
    const record = {
      data: { message: 'held' },
      durationMs: 1,
      level: 'INFO' as const
    }
    sampling?.buffer(key, record)

    expect(sampling?.finalize(key, outcome({ status: SERVER_ERROR }))).toEqual([
      record
    ])
  })

  test('drops a whole request, access line included, when the roll misses', async () => {
    expect(
      await requestLines(ROLL_OUTSIDE_TEN_PERCENT, ROLL_INSIDE_TEN_PERCENT)
    ).toEqual([])
  })

  test('keeps a whole request, access line included, when the roll hits', async () => {
    expect(
      await requestLines(ROLL_INSIDE_TEN_PERCENT, ROLL_OUTSIDE_TEN_PERCENT)
    ).toHaveLength(CUSTOM_LOGS_PER_REQUEST + ACCESS_LINES_PER_REQUEST)
  })
})
