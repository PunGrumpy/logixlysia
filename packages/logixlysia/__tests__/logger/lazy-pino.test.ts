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
  loadedAfterPlugin: { pino: boolean; pinoPretty: boolean }
  loadedAfterUse: { pino: boolean; pinoPretty: boolean }
  stdout: string
}

const script = `
import { createRequire } from 'node:module'
const { logixlysia } = await import(process.env.ENTRY)
const { cache } = createRequire(import.meta.url)
const loaded = () => {
  const keys = Object.keys(cache)
  const has = name => keys.some(key => key.includes('/node_modules/' + name + '/'))
  return { pino: has('pino'), pinoPretty: has('pino-pretty') }
}
const plugin = logixlysia({ config: JSON.parse(process.env.CONFIG) })
const loadedAfterPlugin = loaded()
plugin.store.pino.info('from-store')
await new Promise(resolve => setTimeout(resolve, 50))
console.log(JSON.stringify({ loadedAfterPlugin, loadedAfterUse: loaded() }))
`

const observe = (
  runtime: Runtime,
  entry: string,
  config: Record<string, unknown>
): Observed => {
  const args =
    runtime === 'bun'
      ? ['bun', '-e', script]
      : ['node', '--input-type=module', '-e', script]
  const proc = spawnSync(args, {
    cwd: packageRoot,
    env: { ...process.env, CONFIG: JSON.stringify(config), ENTRY: entry }
  })
  if (proc.exitCode !== 0) {
    throw new Error(`${runtime} child failed: ${proc.stderr}`)
  }
  const lines = proc.stdout.toString().trim().split('\n')
  const summary = JSON.parse(lines.at(-1) ?? '')
  return { ...summary, stdout: lines.slice(0, -1).join('\n') }
}

const targets: [string, Runtime, string, boolean][] = [
  ['src under bun', 'bun', srcEntry, true],
  ['dist under bun', 'bun', distEntry, distReady],
  ['dist under node', 'node', distEntry, distReady && hasNode]
]

describe('lazy pino', () => {
  for (const [name, runtime, entry, runnable] of targets) {
    const run = runnable ? test : test.skip

    run(`${name}: a default config never loads pino or pino-pretty`, () => {
      const seen = observe(runtime, entry, {})
      expect(seen.loadedAfterPlugin).toEqual({ pino: false, pinoPretty: false })
    })

    run(`${name}: store.pino still works synchronously on first use`, () => {
      const seen = observe(runtime, entry, {})
      expect(seen.loadedAfterUse.pino).toBe(true)
      expect(JSON.parse(seen.stdout).msg).toBe('from-store')
    })

    run(`${name}: config.pino loads pino and logs through it`, () => {
      const seen = observe(runtime, entry, { pino: { level: 'info' } })
      expect(seen.loadedAfterPlugin.pino).toBe(true)
      expect(JSON.parse(seen.stdout).msg).toBe('from-store')
    })

    run(`${name}: prettyPrint loads pino-pretty and logs through it`, () => {
      const seen = observe(runtime, entry, { pino: { prettyPrint: true } })
      expect(seen.loadedAfterPlugin.pinoPretty).toBe(true)
      expect(seen.stdout).toContain('from-store')
    })
  }
})
