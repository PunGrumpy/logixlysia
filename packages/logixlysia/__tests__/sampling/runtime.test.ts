import { describe, expect, test } from 'bun:test'

import type { RequestOutcome } from '../../src/sampling'
import { resolveSampling } from '../../src/sampling'

/** Returns each value in turn, then repeats the last one. */
const sequence = (values: number[]): (() => number) => {
  let index = 0
  return () => {
    const value = values[Math.min(index, values.length - 1)] as number
    index += 1
    return value
  }
}

const outcome = (partial: Partial<RequestOutcome> = {}): RequestOutcome => ({
  durationMs: 0,
  pathname: '/',
  status: 200,
  ...partial
})

describe('resolveSampling', () => {
  test('is off when no head rate drops anything', () => {
    expect(resolveSampling(undefined)).toBeUndefined()
    expect(resolveSampling({})).toBeUndefined()
    expect(resolveSampling({ head: {} })).toBeUndefined()
    expect(resolveSampling({ head: { INFO: 100 } })).toBeUndefined()
  })

  test('is off when only tail rules are configured', () => {
    expect(resolveSampling({ tail: { status: 400 } })).toBeUndefined()
  })

  test('is on as soon as one level is thinned', () => {
    expect(resolveSampling({ head: { INFO: 10 } })).toBeDefined()
  })
})

describe('head sampling', () => {
  test('keeps levels that are not listed', () => {
    const sampling = resolveSampling({ head: { INFO: 0 } }, () => 0.99)
    const key = {}
    expect(sampling?.decide('ERROR', key)).toBe('keep')
    expect(sampling?.decide('WARNING', key)).toBe('keep')
    expect(sampling?.decide('DEBUG', key)).toBe('keep')
  })

  test('keeps the configured share of a thinned level', () => {
    // 0.05 -> 5 < 10 (kept); 0.5 -> 50 >= 10 (dropped)
    const sampling = resolveSampling(
      { head: { INFO: 10 } },
      sequence([0.05, 0.5])
    )
    const key = {}
    expect(sampling?.decide('INFO', key)).toBe('keep')
    expect(sampling?.decide('INFO', key)).toBe('drop')
  })

  test('a rate of 0 never keeps, whatever the draw', () => {
    const sampling = resolveSampling({ head: { INFO: 0 } }, () => 0)
    expect(sampling?.decide('INFO', {})).toBe('drop')
  })

  test('an explicit ERROR rate is honored over the keep-everything default', () => {
    const sampling = resolveSampling({ head: { ERROR: 0 } }, () => 0)
    expect(sampling?.decide('ERROR', {})).toBe('drop')
  })
})

describe('tail sampling', () => {
  const config = {
    head: { INFO: 0 },
    tail: { durationMs: 1000, paths: ['/checkout/**'], status: 400 }
  }

  test('buffers dropped records only for requests that were begun', () => {
    const sampling = resolveSampling(config, () => 0.99)
    const begun = {}
    sampling?.begin(begun)

    expect(sampling?.decide('INFO', begun)).toBe('buffer')
    expect(sampling?.decide('INFO', {})).toBe('drop')
  })

  test('replays buffered records when the status matches', () => {
    const sampling = resolveSampling(config, () => 0.99)
    const key = {}
    sampling?.begin(key)
    sampling?.buffer(key, {
      data: { message: 'step 1' },
      durationMs: 2,
      level: 'INFO'
    })
    sampling?.buffer(key, {
      data: { message: 'step 2' },
      durationMs: 4,
      level: 'INFO'
    })

    const records = sampling?.finalize(key, outcome({ status: 500 })) ?? []
    expect(records.map(record => record.data.message)).toEqual([
      'step 1',
      'step 2'
    ])
    expect(records.map(record => record.durationMs)).toEqual([2, 4])
  })

  test('replays when the request was slow', () => {
    const sampling = resolveSampling(config, () => 0.99)
    const key = {}
    sampling?.begin(key)
    sampling?.buffer(key, { data: {}, durationMs: 1, level: 'INFO' })

    expect(sampling?.finalize(key, outcome({ durationMs: 1500 }))).toHaveLength(
      1
    )
  })

  test('replays when the pathname matches a glob', () => {
    const sampling = resolveSampling(config, () => 0.99)
    const key = {}
    sampling?.begin(key)
    sampling?.buffer(key, { data: {}, durationMs: 1, level: 'INFO' })

    expect(
      sampling?.finalize(key, outcome({ pathname: '/checkout/cart' }))
    ).toHaveLength(1)
  })

  test('discards buffered records when nothing matches', () => {
    const sampling = resolveSampling(config, () => 0.99)
    const key = {}
    sampling?.begin(key)
    sampling?.buffer(key, { data: {}, durationMs: 1, level: 'INFO' })

    expect(sampling?.finalize(key, outcome())).toHaveLength(0)
  })

  test('a rescued request keeps every later record', () => {
    const sampling = resolveSampling(config, () => 0.99)
    const key = {}
    sampling?.begin(key)
    sampling?.finalize(key, outcome({ status: 500 }))

    expect(sampling?.decide('INFO', key)).toBe('keep')
  })

  test('an unrescued request drops its final record', () => {
    const sampling = resolveSampling(config, () => 0.99)
    const key = {}
    sampling?.begin(key)
    sampling?.finalize(key, outcome())

    expect(sampling?.decide('INFO', key)).toBe('drop')
  })

  test('buffering stops at maxBufferedPerRequest', () => {
    const sampling = resolveSampling(
      { ...config, maxBufferedPerRequest: 2 },
      () => 0.99
    )
    const key = {}
    sampling?.begin(key)
    for (let index = 0; index < 5; index += 1) {
      sampling?.buffer(key, { data: { index }, durationMs: 0, level: 'INFO' })
    }

    const records = sampling?.finalize(key, outcome({ status: 500 })) ?? []
    expect(records.map(record => record.data.index)).toEqual([0, 1])
  })

  test('finalize clears the buffer so a second call replays nothing', () => {
    const sampling = resolveSampling(config, () => 0.99)
    const key = {}
    sampling?.begin(key)
    sampling?.buffer(key, { data: {}, durationMs: 1, level: 'INFO' })

    expect(sampling?.finalize(key, outcome({ status: 500 }))).toHaveLength(1)
    expect(sampling?.finalize(key, outcome({ status: 500 }))).toHaveLength(0)
  })

  test('drops instead of buffering when no tail rule is configured', () => {
    const sampling = resolveSampling({ head: { INFO: 0 } }, () => 0.99)
    const key = {}
    sampling?.begin(key)
    expect(sampling?.decide('INFO', key)).toBe('drop')
  })

  test('an empty tail object is treated as no tail rules', () => {
    const sampling = resolveSampling(
      { head: { INFO: 0 }, tail: { paths: [] } },
      () => 0.99
    )
    const key = {}
    sampling?.begin(key)
    expect(sampling?.decide('INFO', key)).toBe('drop')
  })
})
