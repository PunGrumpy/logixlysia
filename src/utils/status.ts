import chalk from 'chalk'

/**
 * Converts the status code to a string.
 *
 * @param {number} status The status code.
 * @returns {string} The status code as a string.
 */
function statusString(status: number): string {
  const color =
    status < 300
      ? 'green'
      : status < 400
        ? 'blue'
        : status < 500
          ? 'yellow'
          : 'red'

  return chalk[color](status.toString())
}

export default statusString
