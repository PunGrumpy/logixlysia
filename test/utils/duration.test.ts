// import { describe, expect, it } from 'bun:test'

// import durationString from '~/utils/duration'

// describe('Duration String', () => {
//   const testCases: [string, number, RegExp][] = [
//     [
//       'Generates a string representing the duration in Seconds (s) unit',
//       2e9,
//       new RegExp(`^\\u001B\\[90m\\s+2\\.00s\\s+\\u001B\\[39m$`)
//     ],
//     [
//       'Generates a string representing the duration in Milliseconds (ms) unit',
//       2e6,
//       new RegExp(`^\\u001B\\[90m\\s+2ms\\s+\\u001B\\[39m$`)
//     ],
//     [
//       'Generates a string representing the duration in Microseconds (µs) unit',
//       2e3,
//       new RegExp(`^\\u001B\\[90m\\s+2µs\\s+\\u001B\\[39m$`)
//     ]
//   ]

//   testCases.forEach(([description, nanoseconds, expectedPattern]) => {
//     it(description, () => {
//       const beforeTime = process.hrtime.bigint() - BigInt(nanoseconds)
//       const result = durationString(beforeTime, true)
//       expect(result).toMatch(expectedPattern)
//     })
//   })

//   it('Generates a string representing the duration in Nanoseconds (ns) unit', () => {
//     const beforeTime = process.hrtime.bigint() - BigInt(2)
//     const result = durationString(beforeTime, true)
//     expect(result).toMatch(
//       new RegExp(`^\\u001B\\[90m\\s+\\d+ns\\s+\\u001B\\[39m$`)
//     )
//   })

//   it('Returns non-colored string when useColors is false', () => {
//     const beforeTime = process.hrtime.bigint() - BigInt(2e9)
//     const result = durationString(beforeTime, false)
//     expect(result).toMatch(/^\s+2\.00s\s+$/)
//   })

//   it('Returns a small duration for very small time differences', () => {
//     const beforeTime = process.hrtime.bigint()
//     const result = durationString(beforeTime, true)
//     expect(result).toMatch(
//       new RegExp(`^\\u001B\\[90m\\s+\\d+ns\\s+\\u001B\\[39m$`)
//     )
//   })
// })

// Disable this test for now
