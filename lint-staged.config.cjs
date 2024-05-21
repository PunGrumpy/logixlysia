const { existsSync } = require('fs')
const { join } = require('path')

const isBun = existsSync(join(process.cwd(), 'bun.lockb'))
const isYarn = existsSync(join(process.cwd(), 'yarn.lock'))
const isPnpm = existsSync(join(process.cwd(), 'pnpm-lock.yaml'))

const packageManager = isBun ? 'bun' : isYarn ? 'yarn' : isPnpm ? 'pnpm' : 'npm'

const options = {
  // TypeScript & JavaScript files
  '**/*.(ts)': () => `${packageManager} tsc --noEmit`,
  '**/*.(ts|js|cjs)': filenames => [
    `${packageManager} eslint --fix ${filenames.join(' ')}`,
    `${packageManager} prettier --write ${filenames.join(' ')}`
  ],
  // Markdown & JSON files
  '**/*.(md|json)': filenames =>
    `${packageManager} prettier --write ${filenames.join(' ')}`
}

module.exports = options
