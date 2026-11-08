import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'bun'

const packageRoot = path.join(import.meta.dir, '..', '..')
const distDir = path.join(packageRoot, 'dist')
const distReady = existsSync(path.join(distDir, 'index.js'))

const SOURCE_MAP_LINE = /^\/\/# sourceMappingURL=.*$/mu
const MODULE_SPECIFIER =
  /(?:from|import)\s*\(?\s*["'](?<specifier>[^"']+)["']/gu

/**
 * Every module specifier in `entry` and in the relative chunks it reaches.
 * The inline source map is dropped first so its base64 cannot match.
 */
const collectSpecifiers = (entry: string): string[] => {
  const specifiers: string[] = []
  const files = [entry]
  for (const file of files) {
    const source = readFileSync(file, 'utf-8').replace(SOURCE_MAP_LINE, '')
    for (const match of source.matchAll(MODULE_SPECIFIER)) {
      const specifier = match.groups?.specifier ?? ''
      specifiers.push(specifier)
      const target = path.resolve(path.dirname(file), specifier)
      if (specifier.startsWith('.') && !files.includes(target)) {
        files.push(target)
      }
    }
  }
  return specifiers
}

const runInPackage = (script: string): string => {
  const proc = spawnSync(['bun', '-e', script], { cwd: packageRoot })
  if (proc.exitCode !== 0) {
    throw new Error(`child process failed: ${proc.stderr}`)
  }
  return proc.stdout.toString()
}

describe('logixlysia/errors', () => {
  test.skipIf(!distReady)(
    'bundles with no dependency on a package or a node: module',
    () => {
      const specifiers = collectSpecifiers(path.join(distDir, 'errors.js'))

      expect(
        specifiers.filter(specifier => !specifier.startsWith('.'))
      ).toEqual([])
    }
  )

  test.skipIf(!distReady)(
    'throws an HttpError whose body the guard accepts after a JSON round trip',
    () => {
      const output = runInPackage(`
        const { HttpError, isHttpErrorPayload } = await import('./dist/errors.js')
        const error = new HttpError(402, 'Card declined', { code: 'X' })
        const body = JSON.stringify(error.toJSON())
        console.log(JSON.stringify({ body, guard: isHttpErrorPayload(JSON.parse(body)) }))
      `)
      const { body, guard } = JSON.parse(output) as {
        body: string
        guard: boolean
      }

      expect(JSON.parse(body)).toEqual({
        code: 'X',
        message: 'Card declined',
        status: 402
      })
      expect(guard).toBe(true)
    }
  )

  test.skipIf(!distReady)(
    'is the same HttpError class the package root exports',
    () => {
      const output = runInPackage(`
        const a = await import('./dist/errors.js')
        const b = await import('./dist/index.js')
        console.log(a.HttpError === b.HttpError)
      `)

      expect(output.trim()).toBe('true')
    }
  )
})
