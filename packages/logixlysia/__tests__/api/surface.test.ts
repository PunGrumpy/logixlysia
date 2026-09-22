import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'bun'
import packageJson from '../../package.json'

const packageRoot = join(import.meta.dir, '..', '..')
const distReady = existsSync(join(packageRoot, 'dist', 'index.js'))

const SRC_PREFIX = /^src\//u
const TS_EXTENSION = /\.ts$/u

type ExportEntry =
  | string
  | { import?: string; types?: string; default?: string }

const subpaths = Object.entries(
  packageJson.exports as Record<string, ExportEntry>
).filter(
  ([key, value]) => key !== './package.json' && typeof value !== 'string'
)

/**
 * Resolves each `exports` subpath's named exports in a separate `bun` process
 * rather than importing `dist/*.js` here directly. Importing the built,
 * unexercised bundles in-process would pull them into this suite's own
 * coverage report and sink its per-file threshold.
 */
const resolveSurface = (): Record<string, string[]> => {
  const targets = subpaths.map(([subpath, entry]) => {
    const target = typeof entry === 'string' ? entry : entry.import
    if (!target) {
      throw new Error(`exports["${subpath}"] has no import target`)
    }
    return [subpath, target] as const
  })

  const script = `
    const targets = ${JSON.stringify(targets)}
    const surface = {}
    for (const [subpath, target] of targets) {
      const mod = await import(target)
      surface[subpath] = Object.keys(mod).sort()
    }
    console.log(JSON.stringify(surface))
  `
  const proc = spawnSync(['bun', '-e', script], { cwd: packageRoot })
  if (proc.exitCode !== 0) {
    throw new Error(`resolving exports subpaths failed: ${proc.stderr}`)
  }
  return JSON.parse(proc.stdout.toString())
}

describe('published API surface', () => {
  test('every exports subpath resolves and its named exports match the snapshot', () => {
    if (!distReady) {
      return
    }

    expect(resolveSurface()).toMatchSnapshot()
  })

  test('every bunup entry has an exports subpath and vice versa', async () => {
    const bunupConfig = (await import('../../bunup.config')).default as {
      entry: string[]
    }
    const built = bunupConfig.entry
      .map(file => file.replace(SRC_PREFIX, '').replace(TS_EXTENSION, ''))
      .map(name => (name === 'index' ? '.' : `./${name}`))
      .sort()
    const declared = subpaths.map(([key]) => key).sort()
    expect(built).toEqual(declared)
  })
})
