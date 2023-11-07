import * as pc from 'picocolors'

/**
 * Converts the time difference between the start of the request and the end of the request to a formatted string.
 *
 * @param {bigint} beforeTime The timestamp taken before the request.
 *
 * @returns {string} A formatted duration string with a time unit.
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
    timeMessage = `${seconds}s`
  } else if (nanoseconds >= 1e6) {
    timeMessage = `${durationInMilliseconds}ms`
  } else if (nanoseconds >= 1e3) {
    timeMessage = `${durationInMicroseconds}µs`
  } else {
    timeMessage = `${nanoseconds}ns`
  }

  if (timeMessage) {
    timeMessage = pc.gray(timeMessage).padStart(8).padEnd(16)
  }

  return timeMessage
}

export { durationString }
