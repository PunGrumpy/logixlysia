import chalk from 'chalk'

/**
 * Returns the status string.
 *
 * @param {number} status The status code.
 *
 * @returns {string} The status string.
 */
function statusString(status: number): string {
  switch (true) {
    case status >= 500:
      return chalk.red(status.toString())
    case status >= 400:
      return chalk.yellow(status.toString())
    case status >= 300:
      return chalk.cyan(status.toString())
    case status >= 200:
      return chalk.green(status.toString())
    default:
      return status.toString()
  }
}

export default statusString
