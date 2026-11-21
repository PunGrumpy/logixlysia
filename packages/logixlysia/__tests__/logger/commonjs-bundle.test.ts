import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'bun'
import { CHILD_PROCESS_TIMEOUT_MS } from '../_helpers/child-process'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const packageRoot = path.join(import.meta.dir, '..', '..')
const runnable =
  existsSync(path.join(packageRoot, 'dist', 'index.js')) &&
  Bun.which('node') !== null
const run = runnable ? test : test.skip

const PRETTY_PINO_LINE = /INFO \(\d+\): via pino/u

// The app source sits inside the package so the build resolves elysia and
// the built entry. The bundle runs from a temp dir with no node_modules above
// it.
let sourceDir = ''
let runDir = ''

beforeAll(async () => {
  sourceDir = await mkdtemp(path.join(packageRoot, '.bundle-test-cjs-'))
  runDir = await createTempDir('logixlysia-cjs-bundle-')
})

afterAll(async () => {
  await removeTempDir(sourceDir)
  await removeTempDir(runDir)
})

// A bundler that writes CommonJS, such as esbuild with --format=cjs, leaves
// import.meta empty. Bun fills it in unless the define says otherwise, so the
// define makes this bundle what those bundlers produce.
const runCommonJsBundle = (name: string, source: string): string => {
  const entry = path.join(sourceDir, `${name}.ts`)
  const outfile = path.join(runDir, `${name}.cjs`)
  writeFileSync(entry, source)
  const build = spawnSync(
    [
      'bun',
      'build',
      entry,
      '--target=node',
      '--format=cjs',
      '--define',
      'import.meta.url=undefined',
      '--outfile',
      outfile
    ],
    { cwd: packageRoot }
  )
  if (build.exitCode !== 0) {
    throw new Error(`bundling ${name} failed: ${build.stderr}`)
  }
  const proc = spawnSync(['node', outfile], { cwd: runDir })
  if (proc.exitCode !== 0) {
    throw new Error(`running ${name} failed: ${proc.stdout}${proc.stderr}`)
  }
  return `${proc.stdout}${proc.stderr}`
}

const appSource = (config: string): string => `import { Elysia } from 'elysia'
import logixlysia from '../dist/index.js'
const app = new Elysia()
  .use(logixlysia({ config: ${config} }))
  .get('/', ({ store }) => {
    store.pino.info('via pino')
    return 'ok'
  })
app.handle(new Request('http://localhost/')).then(response => {
  console.log('status', response.status)
})
`

describe('an app bundled to CommonJS without import.meta', () => {
  run(
    'handles a request and logs it',
    () => {
      const output = runCommonJsBundle(
        'plain',
        appSource('{ disableFileLogging: true, showStartupMessage: false }')
      )
      expect(output).toContain('INFO  GET     / 200 ')
      expect(output).toContain('"msg":"via pino"')
      expect(output).toContain('status 200')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  run(
    'pretty prints store.pino lines',
    () => {
      const output = runCommonJsBundle(
        'pretty',
        appSource(
          '{ disableFileLogging: true, pino: { prettyPrint: true }, showStartupMessage: false }'
        )
      )
      expect(output).toMatch(PRETTY_PINO_LINE)
      expect(output).toContain('status 200')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  run(
    'imports logixlysia/otel, which finds no OpenTelemetry',
    () => {
      const output = runCommonJsBundle(
        'otel',
        `import { injectTraceContext } from '../dist/otel.js'
const fields = injectTraceContext(
  { mergeContext: () => undefined },
  new Request('http://localhost/')
)
console.log('trace', String(fields))
`
      )
      expect(output).toContain('trace undefined')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )
})
