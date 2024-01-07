import { describe, expect, it } from 'bun:test'
import durationString from '~/utils/duration'

describe('Duration String', () => {
  it('Returns a duration string with different units', () => {
    const testCases = [
      [1e9, 's'],
      [1e6, 'ms'],
      [1e3, 'µs'],
      [1, 'ns']
    ]

    for (const [nanoseconds, unit] of testCases) {
      const beforeTime = process.hrtime.bigint() - BigInt(String(nanoseconds))

      const result = durationString(beforeTime)
      expect(result).toMatch(String(unit))
    }
  })
})
