import chalk from 'chalk'

/**
 * Converts a time difference into a formatted string with the most appropriate time unit.
 *
 * @param {bigint} beforeTime - The timestamp taken before the request.
 * @returns {string} A formatted duration string including the time unit.
 */
function durationString(beforeTime: bigint): string {
  const currentTime = process.hrtime.bigint()
  const nanoseconds = Number(currentTime - beforeTime)

  const timeUnits = [
    { unit: 's', threshold: 1e9, decimalPlaces: 2 },
    { unit: 'ms', threshold: 1e6, decimalPlaces: 0 },
    { unit: 'µs', threshold: 1e3, decimalPlaces: 0 }
  ]

  for (const { unit, threshold, decimalPlaces } of timeUnits) {
    if (nanoseconds >= threshold) {
      const value = (nanoseconds / threshold).toFixed(decimalPlaces)
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
 * @returns {string} Styled time string.
 */
function formatTime(value: string, unit: string): string {
  return chalk.gray(`${value}${unit}`).padStart(8).padEnd(16)
}

export default durationString
