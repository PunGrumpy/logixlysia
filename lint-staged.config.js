import { existsSync } from 'fs'
import { join } from 'path'

const isBun = existsSync(join(process.cwd(), 'bun.lockb'))
const isYarn = existsSync(join(process.cwd(), 'yarn.lock'))
const isPnpm = existsSync(join(process.cwd(), 'pnpm-lock.yaml'))

const packageManager = isBun ? 'bun' : isYarn ? 'yarn' : isPnpm ? 'pnpm' : 'npm'

const options = {
  '**/*.(ts|tsx)': () => `${packageManager} tsc --noEmit`,
  '**/*.(ts|tsx|js)': filenames => [
    `${packageManager} eslint --fix ${filenames.join(' ')}`,
    `${packageManager} prettier --write ${filenames.join(' ')}`
  ],
  '**/*.(md|json)': filenames =>
    `${packageManager} prettier --write ${filenames.join(' ')}`
}

export default options
