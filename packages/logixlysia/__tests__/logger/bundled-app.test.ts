import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'bun'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const packageRoot = path.join(import.meta.dir, '..', '..')
const distReady = existsSync(path.join(packageRoot, 'dist', 'index.js'))

// The app source sits inside the package so the build resolves elysia and
// pino. The bundle runs from a temp dir with no node_modules above it.
let sourceDir = ''
let runDir = ''

beforeAll(async () => {
  sourceDir = await mkdtemp(path.join(packageRoot, '.bundle-test-'))
  runDir = await createTempDir('logixlysia-bundle-')
})

afterAll(async () => {
  await removeTempDir(sourceDir)
  await removeTempDir(runDir)
})

const runBundledApp = (name: string, config: string): string => {
  const entry = path.join(sourceDir, `${name}.ts`)
  const outfile = path.join(runDir, `${name}.js`)
  writeFileSync(
    entry,
    `import { Elysia } from 'elysia'
import logixlysia from '../dist/index.js'
const app = new Elysia()
  .use(logixlysia({ config: ${config} }))
  .get('/', ({ store }) => {
    store.pino.info('via pino')
    return 'ok'
  })
const response = await app.handle(new Request('http://localhost/'))
console.log('status', response.status)
`
  )
  const build = spawnSync(
    ['bun', 'build', entry, '--target=bun', '--outfile', outfile],
    { cwd: packageRoot }
  )
  if (build.exitCode !== 0) {
    throw new Error(`bundling ${name} failed: ${build.stderr}`)
  }
  const run = spawnSync(['bun', '--no-install', outfile], { cwd: runDir })
  return `${run.stdout}${run.stderr}`
}

describe('an app bundled into one file', () => {
  test.skipIf(!distReady)('runs where pino cannot be resolved', () => {
    expect(() => Bun.resolveSync('pino', runDir)).toThrow()
  })

  test.skipIf(!distReady)('logs through store.pino', () => {
    const output = runBundledApp('plain', '{}')
    expect(output).toContain('"msg":"via pino"')
    expect(output).toContain('status 200')
  })

  test.skipIf(!distReady)('logs through pino-pretty with prettyPrint', () => {
    const output = runBundledApp('pretty', '{ pino: { prettyPrint: true } }')
    expect(output).toContain('INFO')
    expect(output).toContain('via pino')
    expect(output).toContain('status 200')
  })
})
