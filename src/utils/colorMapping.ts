import chalk from 'chalk'
import { ColorMap } from '~/types'

/**
 * The color map for the log levels.
 *
 * @type {ColorMap}
 * @property {chalk.Chalk} INFO The color for the INFO log level.
 * @property {chalk.Chalk} WARNING The color for the WARNING log level.
 * @property {chalk.Chalk} ERROR The color for the ERROR log level.
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
 * @property {chalk.Chalk} GET The color for the GET HTTP method.
 * @property {chalk.Chalk} POST The color for the POST HTTP method.
 * @property {chalk.Chalk} PUT The color for the PUT HTTP method.
 * @property {chalk.Chalk} DELETE The color for the DELETE HTTP method.
 * @property {chalk.Chalk} PATCH The color for the PATCH HTTP method.
 * @property {chalk.Chalk} OPTIONS The color for the OPTIONS HTTP method.
 * @property {chalk.Chalk} HEAD The color for the HEAD HTTP method.
 */
const HttpMethodColorMap: ColorMap = {
  GET: chalk.white,
  POST: chalk.yellow,
  PUT: chalk.blue,
  DELETE: chalk.red,
  PATCH: chalk.green,
  OPTIONS: chalk.cyan,
  HEAD: chalk.magenta
}

export { LogLevelColorMap, HttpMethodColorMap }
