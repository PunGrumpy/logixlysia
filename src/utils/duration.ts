import chalk from 'chalk'

const timeUnits = [
  { unit: 's', threshold: 1e9, decimalPlaces: 2 },
  { unit: 'ms', threshold: 1e6, decimalPlaces: 0 },
  { unit: 'µs', threshold: 1e3, decimalPlaces: 0 },
  { unit: 'ns', threshold: 1, decimalPlaces: 0 }
]

/**
 * Converts a time difference into a formatted string with the most appropriate time unit.
 *
 * @param {bigint} beforeTime - The timestamp taken before the request.
 * @param {boolean} useColors - Whether to apply colors to the output.
 * @returns {string} A formatted duration string including the time unit.
 */
function durationString(beforeTime: bigint, useColors: boolean): string {
  const nanoseconds = Number(process.hrtime.bigint() - beforeTime)

  for (const { unit, threshold, decimalPlaces } of timeUnits) {
    if (nanoseconds >= threshold) {
      const value = (nanoseconds / threshold).toFixed(decimalPlaces)
      const timeStr = `${value}${unit}`.padStart(8).padEnd(16)
      return useColors ? chalk.gray(timeStr) : timeStr
    }
  }

  return useColors
    ? chalk.gray('0ns'.padStart(8).padEnd(16))
    : '0ns'.padStart(8).padEnd(16)
}

export default durationString
