import { describe, expect, it } from 'bun:test'
import chalk from 'chalk'
import methodString from '~/utils/method'

describe('Method String', () => {
  it('Returns a colored string for GET method', () => {
    const result = methodString('GET')
    expect(result).toBe(chalk.white('GET    '))
  })

  it('Returns a colored string for POST method', () => {
    const result = methodString('POST')
    expect(result).toBe(chalk.yellow('POST   '))
  })

  it('Returns the input string if method is not recognized', () => {
    const result = methodString('INVALID_METHOD')
    expect(result).toBe('INVALID_METHOD') // No coloring, returns the original string
  })
})
