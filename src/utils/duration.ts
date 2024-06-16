import chalk from 'chalk'

/**
 * Converts a time difference into a formatted string with the most appropriate time unit.
 *
 * @param {bigint} beforeTime - The timestamp taken before the request.
 * @param {boolean} useColors - Whether to apply colors to the output.
 * @returns {string} A formatted duration string including the time unit.
 */
function durationString(beforeTime: bigint, useColors: boolean): string {
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
      return formatTime(value, unit, useColors)
    }
  }

  return formatTime(nanoseconds.toString(), 'ns', useColors)
}

/**
 * Formats the time value with the given unit and applies chalk styling.
 *
 * @param {string} value - The time value.
 * @param {string} unit - The time unit.
 * @param {boolean} useColors - Whether to apply colors to the output.
 * @returns {string} Styled time string.
 */
function formatTime(value: string, unit: string, useColors: boolean): string {
  const timeStr = `${value}${unit}`
  return useColors
    ? chalk.gray(timeStr).padStart(8).padEnd(16)
    : timeStr.padStart(8).padEnd(16)
}

export default durationString
