import chalk from 'chalk'

/**
 * Converts a time difference into a formatted string with the most appropriate time unit.
 * Units used are seconds (s), milliseconds (ms), microseconds (µs), and nanoseconds (ns).
 *
 * @param {bigint} beforeTime - The timestamp taken before the request.
 *
 * @returns {string} A formatted duration string including the time unit.
 */
function durationString(beforeTime: bigint): string {
  const nanoseconds = Number(process.hrtime.bigint() - beforeTime)

  const timeUnits = [
    { unit: 's', threshold: 1e9 },
    { unit: 'ms', threshold: 1e6 },
    { unit: 'µs', threshold: 1e3 }
  ]

  for (const { unit, threshold } of timeUnits) {
    if (nanoseconds >= threshold) {
      const value = (nanoseconds / threshold).toFixed(threshold === 1e9 ? 2 : 0)
      return formatTime(value, unit)
    }
  }

  return formatTime(nanoseconds.toString(), 'ns')
}

/**
 * Formats the time value with the given unit and applies chalk styling.
 *
 * @param {string} value - The time value.
 * @param {string} unit - The time unit.
 *
 * @returns {string} Styled time string.
 */
function formatTime(value: string, unit: string): string {
  return chalk.gray(`${value}${unit}`).padStart(8).padEnd(16)
}

export default durationString
