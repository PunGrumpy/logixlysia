import { describe, expect, it } from 'bun:test'
import chalk from 'chalk'

import statusString from '~/utils/status'

describe('Status String', () => {
  it('Presents the status string in green for a 200 status code', () => {
    const result = statusString(200)
    expect(result).toBe(chalk.green('200'))
  })

  it('Presents the status string in green for a 301 status code', () => {
    const result = statusString(301)
    expect(result).toBe(chalk.cyan('301'))
  })

  it('Presents the status string in green for a 404 status code', () => {
    const result = statusString(404)
    expect(result).toBe(chalk.yellow('404'))
  })

  it('Presents the status string in green for a 500 status code', () => {
    const result = statusString(500)
    expect(result).toBe(chalk.red('500'))
  })

  it('Presents the status string in green for a 100 status code', () => {
    const result = statusString(100)
    expect(result).toBe(chalk.white('100'))
  })
})
