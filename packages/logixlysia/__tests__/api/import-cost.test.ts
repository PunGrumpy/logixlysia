import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'bun'

const packageRoot = path.join(import.meta.dir, '..', '..')
const distEntry = path.join(packageRoot, 'dist', 'index.js')
const runnable = existsSync(distEntry) && Bun.which('node') !== null

const script = `
await import(process.env.ENTRY)
const loaded = name => process.moduleLoadList.includes('NativeModule ' + name)
console.log(JSON.stringify({ http: loaded('http'), zlib: loaded('zlib') }))
`

const run = runnable ? test : test.skip

run('importing the plugin under node loads neither http nor zlib', () => {
  const proc = spawnSync(['node', '--input-type=module', '-e', script], {
    cwd: packageRoot,
    env: { ...process.env, ENTRY: distEntry }
  })
  if (proc.exitCode !== 0) {
    throw new Error(`node child failed: ${proc.stderr}`)
  }
  expect(JSON.parse(proc.stdout.toString())).toEqual({
    http: false,
    zlib: false
  })
})
