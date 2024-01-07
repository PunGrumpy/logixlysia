import { describe, expect, it } from 'bun:test'
import durationString from '~/utils/duration'

describe('Duration String', () => {
  it('Returns a formatted string for seconds', () => {
    const beforeTime = process.hrtime.bigint() - BigInt(1e9) // 1 second
    const result = durationString(beforeTime)
    expect(result).toMatch('s')
  })

  it('Returns a formatted string for milliseconds', () => {
    const beforeTime = process.hrtime.bigint() - BigInt(1e6) // 1 millisecond
    const result = durationString(beforeTime)
    expect(result).toMatch('ms')
  })

  it('Returns a formatted string for microseconds', () => {
    const beforeTime = process.hrtime.bigint() - BigInt(1e3) // 1 microsecond
    const result = durationString(beforeTime)
    expect(result).toMatch('µs')
  })

  it('Returns a formatted string for nanoseconds', () => {
    const beforeTime = process.hrtime.bigint() - BigInt(1) // 1 nanosecond
    const result = durationString(beforeTime)
    expect(result).toMatch('ns')
  })

  it('Returns an empty string for negative time difference', () => {
    const beforeTime = process.hrtime.bigint() + BigInt(1e6) // Negative duration
    const result = durationString(beforeTime)
    expect(result).toMatch('')
  })
})
