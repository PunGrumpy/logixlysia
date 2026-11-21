import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'bun'
import packageJson from '../../package.json'
import { CHILD_PROCESS_TIMEOUT_MS } from '../_helpers/child-process'
import { isElysia2 } from '../_helpers/elysia'

const packageRoot = path.join(import.meta.dir, '..', '..')
const entry = path.join(packageRoot, 'dist', 'index.js')
const MIN_PORT = 20_000
const PORT_SPAN = 20_000
const hasNode = Bun.which('node') !== null

const describeFailure = (
  what: string,
  proc: ReturnType<typeof spawnSync>
): string =>
  proc.exitedDueToTimeout
    ? `starting ${what} timed out after ${CHILD_PROCESS_TIMEOUT_MS} ms`
    : `starting ${what} failed: ${proc.stderr}`

/**
 * Runs the app in a separate `bun` process so the built bundles stay out of
 * this suite's coverage report, as `__tests__/api/surface.test.ts` does.
 */
const startApp = (): string => {
  const script = `
    import { Elysia } from 'elysia'
    import { logixlysia } from './dist/index.js'
    let printed = false
    const log = console.log
    console.log = (...args) => {
      printed = true
      log(...args)
    }
    const app = new Elysia().use(logixlysia()).listen(0)
    const deadline = Date.now() + 5000
    while (!printed && Date.now() < deadline) {
      await Bun.sleep(10)
    }
    await app.stop(true)
  `
  const proc = spawnSync([process.execPath, '-e', script], {
    cwd: packageRoot,
    timeout: CHILD_PROCESS_TIMEOUT_MS
  })
  if (proc.exitCode !== 0) {
    throw new Error(describeFailure('the built app', proc))
  }
  return proc.stdout.toString()
}

describe('startup banner from the built package', () => {
  test.skipIf(!existsSync(entry))(
    'shows the logixlysia version row',
    () => {
      expect(startApp()).toContain(`logixlysia v${packageJson.version}`)
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test.skipIf(!(existsSync(entry) && hasNode) || isElysia2)(
    'prints no URL under the Node adapter',
    () => {
      const port = MIN_PORT + Math.floor(Math.random() * PORT_SPAN)
      const script = `
        import { Elysia } from 'elysia'
        import { node } from '@elysiajs/node'
        import { logixlysia } from './dist/index.js'
        new Elysia({ adapter: node() })
          .use(logixlysia())
          .listen({ port: ${port} }, server => {
            server.stop()
          })
      `
      const proc = spawnSync(['node', '--input-type=module', '-e', script], {
        cwd: packageRoot,
        timeout: CHILD_PROCESS_TIMEOUT_MS
      })
      if (proc.exitCode !== 0) {
        throw new Error(describeFailure('the app under node', proc))
      }
      const output = proc.stdout.toString()
      expect(output).toContain(`logixlysia v${packageJson.version}`)
      expect(output).not.toContain('http')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )
})
