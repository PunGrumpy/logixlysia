/* eslint-disable @typescript-eslint/no-var-requires */
const { existsSync } = require('fs')
const { join } = require('path')

const isBun = existsSync(join(process.cwd(), 'bun.lockb'))
const isYarn = existsSync(join(process.cwd(), 'yarn.lock'))
const isPnpm = existsSync(join(process.cwd(), 'pnpm-lock.yaml'))

const packageManager = isBun ? 'bun' : isYarn ? 'yarn' : isPnpm ? 'pnpm' : 'npm'

const options = {
  // TypeScript & JavaScript files
  '**/*.(ts|tsx)': () => `${packageManager} tsc --noEmit`,
  '**/*.(ts|tsx|js)': filenames => [
    `${packageManager} eslint --fix ${filenames.join(' ')}`,
    `${packageManager} prettier --write ${filenames.join(' ')}`
  ],
  '**/*.(css|less|scss)': filenames =>
    `${packageManager} test --timeout 5000 --coverage --update-snapshots ${filenames.join(
      ' '
    )}`,
  // Markdown & JSON files
  '**/*.(md|json)': filenames =>
    `${packageManager} prettier --write ${filenames.join(' ')}`
}

module.exports = options
