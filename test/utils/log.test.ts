import { describe, expect, it } from 'bun:test'
import chalk from 'chalk'
import logString from '~/utils/log'

describe('Log String', () => {
  it('Returns a colored string for INFO log level', () => {
    const result = logString('INFO')
    expect(result).toBe(chalk.bgGreen.black('INFO   '))
  })

  it('Returns a colored string for WARNING log level', () => {
    const result = logString('WARNING')
    expect(result).toBe(chalk.bgYellow.black('WARNING'))
  })

  it('Returns a colored string for ERROR log level', () => {
    const result = logString('ERROR')
    expect(result).toBe(chalk.bgRed.black('ERROR  '))
  })

  it('Returns the input string if log level is not recognized', () => {
    const result = logString('DEBUG') // Assuming 'DEBUG' is not in the colorMap
    expect(result).toBe('DEBUG') // No coloring, returns the original string
  })
})
