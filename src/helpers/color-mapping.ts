import chalk from 'chalk'

import type { ColorMap } from '../interfaces'

export const LogLevelColorMap: ColorMap = {
  INFO: chalk.bgGreen.black,
  WARNING: chalk.bgYellow.black,
  ERROR: chalk.bgRed.black
}

export const HttpMethodColorMap: ColorMap = {
  GET: chalk.green,
  POST: chalk.yellow,
  PUT: chalk.blue,
  PATCH: chalk.magentaBright,
  DELETE: chalk.red,
  HEAD: chalk.cyan,
  OPTIONS: chalk.magenta
}
