import chalk from 'chalk'

/**
 * Converts the time difference between the start of the request and the end of the request to a formatted string.
 *
 * @param {bigint} beforeTime The timestamp taken before the request.
 *
 * @returns {string} A formatted duration string with a time unit.
 */
function durationString(beforeTime: bigint): string {
  const now = process.hrtime.bigint()
  const nanoseconds = Number(now - beforeTime)

  let timeMessage: string = ''

  if (nanoseconds >= 1e9) {
    timeMessage = `${(nanoseconds / 1e9).toFixed(2)}s`
  } else if (nanoseconds >= 1e6) {
    timeMessage = `${(nanoseconds / 1e6).toFixed(0)}ms`
  } else if (nanoseconds >= 1e3) {
    timeMessage = `${(nanoseconds / 1e3).toFixed(0)}µs`
  } else {
    timeMessage = `${nanoseconds}ns`
  }

  return timeMessage ? chalk.gray(timeMessage).padStart(8).padEnd(16) : ''
}

export default durationString
