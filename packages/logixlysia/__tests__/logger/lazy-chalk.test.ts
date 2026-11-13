import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'bun'

const packageRoot = path.join(import.meta.dir, '..', '..')
const srcEntry = path.join(packageRoot, 'src', 'index.ts')
const distEntry = path.join(packageRoot, 'dist', 'index.js')
const distReady = existsSync(distEntry)
const hasNode = Bun.which('node') !== null

type Runtime = 'bun' | 'node'

interface Observed {
  afterImport: boolean
  afterLine: boolean
  line: string
}

const script = `
import * as nodeModule from 'node:module'
const isChalk = key => key.includes('/node_modules/chalk/')
let seen = false
// Node keeps an imported ES module out of require.cache, so a load hook watches
// it there. Bun has no load hooks but lists both kinds in the cache.
if (process.versions.bun === undefined) {
  nodeModule.registerHooks({
    load(url, context, next) {
      seen ||= isChalk(url)
      return next(url, context)
    }
  })
}
const { cache } = nodeModule.createRequire(import.meta.url)
const loaded = () => seen || Object.keys(cache).some(isChalk)
const { createLogger } = await import(process.env.ENTRY)
const afterImport = loaded()
if (process.env.TTY === '1') {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
}
let line = ''
console.info = value => { line = String(value) }
createLogger({ config: { disableFileLogging: true } }).info(new Request('http://localhost/hi'), 'hi')
process.stderr.write(JSON.stringify({ afterImport, afterLine: loaded(), line }))
`

const observe = (runtime: Runtime, entry: string, tty: boolean): Observed => {
  const args =
    runtime === 'bun'
      ? ['bun', '-e', script]
      : ['node', '--input-type=module', '-e', script]
  const { NO_COLOR: _noColor, ...env } = process.env
  const proc = spawnSync(args, {
    cwd: packageRoot,
    env: { ...env, ENTRY: entry, FORCE_COLOR: '3', TTY: tty ? '1' : '0' }
  })
  if (proc.exitCode !== 0) {
    throw new Error(`${runtime} child failed: ${proc.stderr}`)
  }
  return JSON.parse(proc.stderr.toString())
}

const targets: [string, Runtime, string, boolean][] = [
  ['src under bun', 'bun', srcEntry, true],
  ['dist under bun', 'bun', distEntry, distReady],
  ['dist under node', 'node', distEntry, distReady && hasNode]
]

describe('lazy chalk', () => {
  for (const [name, runtime, entry, runnable] of targets) {
    const run = runnable ? test : test.skip

    run(`${name}: a logger without a terminal never loads chalk`, () => {
      const seen = observe(runtime, entry, false)
      expect(seen).toMatchObject({ afterImport: false, afterLine: false })
      expect(seen.line).not.toContain('\u001B[')
    })

    run(`${name}: a logger on a terminal loads chalk and colors`, () => {
      const seen = observe(runtime, entry, true)
      expect(seen).toMatchObject({ afterImport: false, afterLine: true })
      expect(seen.line).toContain('\u001B[')
    })
  }
})
