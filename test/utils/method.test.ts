import { describe, expect, it } from 'bun:test'
import chalk from 'chalk'

import methodString from '~/utils/method'

describe('Method String', () => {
  it('Displays a colored string for the GET method', () => {
    const result = methodString('GET')
    expect(result).toBe(chalk.white('GET    '))
  })

  it('Displays a colored string for the POST method', () => {
    const result = methodString('POST')
    expect(result).toBe(chalk.yellow('POST   '))
  })

  it('Outputs the original method string if it is not recognized', () => {
    const result = methodString('INVALID_METHOD')
    expect(result).toBe('INVALID_METHOD') // No coloring, returns the original string
  })
})
