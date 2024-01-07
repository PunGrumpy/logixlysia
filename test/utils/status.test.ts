import chalk from 'chalk'
import { describe, expect, it } from 'bun:test'
import statusString from '~/utils/status'

describe('Status String', () => {
  it('Returns the status string for 200 status code', () => {
    const result = statusString(200)
    expect(result).toBe(chalk.green('200'))
  })

  it('Returns the status string for 301 status code', () => {
    const result = statusString(301)
    expect(result).toBe(chalk.cyan('301'))
  })

  it('Returns the status string for 404 status code', () => {
    const result = statusString(404)
    expect(result).toBe(chalk.yellow('404'))
  })

  it('Returns the status string for 500 status code', () => {
    const result = statusString(500)
    expect(result).toBe(chalk.red('500'))
  })

  it('Returns the status string for 100 status code', () => {
    const result = statusString(100)
    expect(result).toBe('100')
  })
})
