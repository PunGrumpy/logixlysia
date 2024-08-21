import chalk from 'chalk'

/**
 * Converts the status code to a string.
 *
 * @param {number} status The status code.
 * @param {boolean} useColors - Whether to apply colors to the output.
 * @returns {string} The status code as a string.
 */
const statusString = (status: number, useColors: boolean): string => {
  const color =
    status >= 500
      ? 'red'
      : status >= 400
        ? 'yellow'
        : status >= 300
          ? 'cyan'
          : status >= 200
            ? 'green'
            : 'white'
  return useColors ? chalk[color](status.toString()) : status.toString()
}

export default statusString
