import { execSync } from 'node:child_process'

// Vercel's convention: exit 0 skips the build, any other code runs it.
const SKIP = 0
const BUILD = 1

const VERSION_SOURCE = 'packages/logixlysia/package.json'
const WATCHED = [
  'apps/docs',
  VERSION_SOURCE,
  'packages/typescript-config',
  'bun.lock',
  'turbo.json'
]

const root = execSync('git rev-parse --show-toplevel').toString().trim()
const commitMessage = execSync('git log -1 --pretty=%B', { cwd: root })
  .toString()
  .trim()

if (commitMessage.includes('[skip ci]')) {
  process.exit(SKIP)
}

// Unset on a branch's first deployment; HEAD^ is missing in a shallow clone.
// Either way `git diff` fails and the build runs, which is the safe side.
const base = process.env.VERCEL_GIT_PREVIOUS_SHA || 'HEAD^'

try {
  execSync(`git diff --quiet ${base} HEAD -- ${WATCHED.join(' ')}`, {
    cwd: root,
    stdio: 'ignore'
  })
  process.exit(SKIP)
} catch {
  process.exit(BUILD)
}
