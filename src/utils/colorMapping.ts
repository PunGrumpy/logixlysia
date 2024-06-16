import chalk from 'chalk'

import { ColorMap } from '~/types'

/**
 * The color map for the log levels.
 *
 * @type {ColorMap}
 */
const LogLevelColorMap: ColorMap = {
  INFO: chalk.bgGreen.black,
  WARNING: chalk.bgYellow.black,
  ERROR: chalk.bgRed.black
}

/**
 * The color map for the HTTP methods.
 *
 * @type {ColorMap}
 */
const HttpMethodColorMap: ColorMap = {
  GET: chalk.green,
  POST: chalk.yellow,
  PUT: chalk.blue,
  PATCH: chalk.magentaBright,
  DELETE: chalk.red,
  HEAD: chalk.cyan,
  OPTIONS: chalk.magenta
}

export { HttpMethodColorMap, LogLevelColorMap }
