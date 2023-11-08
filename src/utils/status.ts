import chalk from 'chalk'

/**
 * Returns the status string.
 *
 * @param {number} status The status code.
 *
 * @returns {string} The status string.
 */
function statusString(status: number): string {
  if (status >= 500) {
    return chalk.red(status.toString())
  }
  if (status >= 400) {
    return chalk.yellow(status.toString())
  }
  if (status >= 300) {
    return chalk.cyan(status.toString())
  }
  if (status >= 200) {
    return chalk.green(status.toString())
  }

  return status.toString()
}

export default statusString
