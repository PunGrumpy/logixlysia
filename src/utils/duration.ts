/**
 * Converts the time difference between the start of the request and the end of the request to a formatted string.
 *
 * @param {bigint} beforeTime - The timestamp taken before the request.
 * @returns {string} - A formatted duration string with a time unit.
 * @example
 * durationString(123456789n) // => '| 123456789ns'
 * durationString(123456789000n) // => '| 123456789µs'
 * durationString(123456789000000n) // => '| 123456789ms'
 * durationString(123456789000000000n) // => '| 123.46s'
 */
function durationString(beforeTime: bigint): string {
  const now = process.hrtime.bigint()
  const timeDifference = now - beforeTime
  const nanoseconds = Number(timeDifference)

  const durationInMicroseconds = (nanoseconds / 1e3).toFixed(0)
  const durationInMilliseconds = (nanoseconds / 1e6).toFixed(0)

  let timeMessage: string = ''

  if (nanoseconds >= 1e9) {
    const seconds = (nanoseconds / 1e9).toFixed(2)
    timeMessage = `| ${seconds}s`
  } else if (nanoseconds >= 1e6) {
    timeMessage = `| ${durationInMilliseconds}ms`
  } else if (nanoseconds >= 1e3) {
    timeMessage = `| ${durationInMicroseconds}µs`
  } else {
    timeMessage = `| ${nanoseconds}ns`
  }

  return timeMessage
}

export { durationString }
