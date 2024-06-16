import chalk from 'chalk'

/**
 * Converts the status code to a string.
 *
 * @param {number} status The status code.
 * @returns {string} The status code as a string.
 */
function statusString(status: number): string {
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
  return chalk[color](status.toString())
}

export default statusString
