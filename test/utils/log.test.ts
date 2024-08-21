import { describe, expect, it } from 'bun:test'
import chalk from 'chalk'

import logString from '~/utils/log'

describe('Log String', () => {
  it('Produces a green background string for INFO log level', () => {
    const result = logString('INFO', true)
    expect(result).toBe(chalk.bgGreen.black('INFO   '))
  })

  it('Produces a yellow background string for WARNING log level', () => {
    const result = logString('WARNING', true)
    expect(result).toBe(chalk.bgYellow.black('WARNING'))
  })

  it('Produces a red background string for ERROR log level', () => {
    const result = logString('ERROR', true)
    expect(result).toBe(chalk.bgRed.black('ERROR  '))
  })

  it('Returns the padded input string for unrecognized log levels', () => {
    const result = logString('DEBUG', true)
    expect(result).toBe('DEBUG')
  })

  it('Returns the padded input string without colors when useColors is false', () => {
    const result = logString('INFO', false)
    expect(result).toBe('INFO   ')
  })
})
