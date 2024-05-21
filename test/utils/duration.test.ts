import { describe, expect, it } from 'bun:test'

import durationString from '~/utils/duration'

describe('Duration String', () => {
  const testCases = [
    [
      'Generates a string representing the duration in Seconds (s) unit',
      1e9,
      's'
    ],
    [
      'Generates a string representing the duration in Milliseconds (ms) unit',
      1e6,
      'ms'
    ],
    [
      'Generates a string representing the duration in Microseconds (µs) unit',
      1e3,
      'µs'
    ]
    // [
    //   'Generates a string representing the duration in Nanoseconds (ns) unit',
    //   1,
    //   'ns'
    // ]
  ]

  for (const [description, nanoseconds, unit] of testCases) {
    it(`${description}`, () => {
      const beforeTime = process.hrtime.bigint() - BigInt(String(nanoseconds))
      const result = durationString(beforeTime)

      expect(result).toMatch(String(unit))
    })
  }
})
