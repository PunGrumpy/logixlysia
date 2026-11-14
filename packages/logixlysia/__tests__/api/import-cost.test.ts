import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'bun'

const packageRoot = path.join(import.meta.dir, '..', '..')
const distEntry = path.join(packageRoot, 'dist', 'index.js')
const runnable = existsSync(distEntry) && Bun.which('node') !== null

// Elysia 2 loads both modules itself, so the plugin is measured against
// what importing Elysia alone already loaded.
const script = `
const loaded = () => ({
  http: process.moduleLoadList.includes('NativeModule http'),
  zlib: process.moduleLoadList.includes('NativeModule zlib')
})
await import('elysia')
const byElysia = loaded()
await import(process.env.ENTRY)
console.log(JSON.stringify({ byElysia, byPlugin: loaded() }))
`

const run = runnable ? test : test.skip

run(
  'importing the plugin under node loads neither http nor zlib beyond Elysia',
  () => {
    const proc = spawnSync(['node', '--input-type=module', '-e', script], {
      cwd: packageRoot,
      env: { ...process.env, ENTRY: distEntry }
    })
    if (proc.exitCode !== 0) {
      throw new Error(`node child failed: ${proc.stderr}`)
    }
    const { byElysia, byPlugin } = JSON.parse(proc.stdout.toString())
    expect(byPlugin).toEqual(byElysia)
  }
)
