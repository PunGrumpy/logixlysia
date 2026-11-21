# Plan 149: An app bundled to CommonJS imports the package and logs its requests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. Skip any instruction to update `plans/README.md`:
> the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/src/output/rotation-manager.ts packages/logixlysia/src/helpers/otel-api.ts packages/logixlysia/__tests__/logger/commonjs-bundle.test.ts`
> `create-logger.ts` may show a change from another pull request that adds a function after `resolveTimestampPattern` (around line 122). That is expected. Only the excerpts of the lines this plan touches (the `requireChalk` constant and `loadChalk`, lines 59 to 79) must match the live code. Any other mismatch in an in-scope file is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (needs `packages/logixlysia/__tests__/_helpers/child-process.ts`, which is on `main` since commit `e017375`)
- **Category**: bug
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

An app that bundles `logixlysia` 6.14.0 into one CommonJS file with esbuild crashes when the bundle loads, before it handles any request. esbuild with `--format=cjs` leaves `import.meta` empty, so `import.meta.url` is `undefined`, and three modules of this package call `createRequire(import.meta.url)` at their top level, where nothing catches the error. esbuild to CommonJS is the default output of AWS CDK's `NodejsFunction` and common in serverless setups. The same app built against 6.10.7, 6.11.0 and 6.12.0 answered `status 200`.

Measured at `c019a4f`: a five-line Elysia app that uses the plugin and `store.pino`, bundled with `esbuild --bundle --platform=node --format=cjs` and run with `node`:

```
TypeError [ERR_INVALID_ARG_VALUE]: The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined
    at createRequire (node:internal/modules/cjs/loader:2190:11)
```

An app that imports only `logixlysia/otel` crashes the same way; that subpath has had the fault since 6.5.0.

After this plan the same bundle prints its log lines and `status 200`:

```
{"level":30,"time":1795290041595,"pid":3579,"hostname":"…","msg":"via pino"}
2026-11-21T19:40:41.599Z INFO  GET     / 200 14ms
status 200
```

Each feature behind those three calls falls back the way its code already does when its module cannot be loaded. Measured in an esbuild CommonJS bundle with the fix:

| Feature | In a CommonJS bundle after this plan |
| --- | --- |
| Import, request handling, access line, `log.info` in a handler | Works |
| `store.pino`, JSON and `pino.prettyPrint` (`[…] INFO (pid): via pino`) | Works |
| File logging and size rotation | Works |
| Console colors | Off. Lines are plain even on a terminal with `FORCE_COLOR=3`, because chalk is not loaded (the same fallback as Node before 22.12) |
| `logRotation.compress` | The rotated file is kept uncompressed and the failure goes through the existing rotation error path: `[logixlysia] log rotation failed: TypeError [ERR_INVALID_ARG_VALUE] …` |
| `logixlysia/otel` | Imports. `@opentelemetry/api` is never found, so `injectTraceContext` and `otelEnricher` add nothing |
| Startup banner | Shows `Elysia` without a version and no logixlysia version line (unchanged; that code already catches the same error) |

## Current state

All source paths below are relative to `packages/logixlysia/`.

The package is ESM only. bunup builds `dist/*.js` from `src/` and keeps `createRequire(import.meta.url)` as written. A bundler that writes CommonJS cannot fill in `import.meta.url`, so the expression is `undefined` in its output.

`src/logger/create-logger.ts` lines 59 to 79 (line 1 is `import { createRequire } from 'node:module'`):

```ts
type ChalkInstance = typeof chalkModule

const requireChalk = createRequire(import.meta.url)

let loadedChalk: ChalkInstance | null | undefined

// chalk detects color support as it loads, a third of this package's import
// time, so it loads when a text logger is created on a terminal and any other
// logger never pays for it. Node before 22.12 cannot require an ES module, so there
// the lines stay plain.
const loadChalk = (): ChalkInstance | null => {
  if (loadedChalk === undefined) {
    try {
      loadedChalk = (requireChalk('chalk') as { default: ChalkInstance })
        .default
    } catch {
      loadedChalk = null
    }
  }
  return loadedChalk
}
```

A `null` from `loadChalk` already means plain lines: `shouldUseColors` requires `loadChalk() !== null`.

`src/output/rotation-manager.ts` lines 15 to 24 (line 3 is `import { createRequire } from 'node:module'`):

```ts
const requireBuiltin = createRequire(import.meta.url)

// Required on first use because only a rotation that compresses needs them.
// A dynamic import() would do, but the bundler then links its runtime chunk
// into every entry, the dependency-free `logixlysia/errors` included.
const gzipAsync = async (content: Buffer): Promise<Buffer> => {
  const util = requireBuiltin('node:util') as { promisify: typeof Promisify }
  const zlib = requireBuiltin('node:zlib') as { gzip: typeof Gzip }
  return await util.promisify(zlib.gzip)(content)
}
```

`gzipAsync` has one caller, `compressFile` (same file, around line 87), which awaits it inside a `try` whose `catch` calls `reportRotationError`. So an error thrown inside `gzipAsync` is already reported and the rotated file is left as it is. Keep `createRequire`. Do not switch to `import()`: the comment above says why, and `__tests__/api/errors-subpath.test.ts` (`bundles with no dependency on a package or a node: module`) fails if `dist/errors.js` gains an import.

`src/helpers/otel-api.ts` lines 18 to 32 (line 1 is `import { createRequire } from 'node:module'`). Only `src/otel.ts` imports this module, so it runs when an app imports `logixlysia/otel`:

```ts
const requireOtel = createRequire(import.meta.url)

let otelApi: OtelApi | null | undefined

export const getOtelApi = (): OtelApi | null => {
  if (otelApi !== undefined) {
    return otelApi
  }
  try {
    otelApi = requireOtel('@opentelemetry/api') as OtelApi
  } catch {
    otelApi = null
  }
  return otelApi
}
```

The pattern to follow is already in the package: `src/extensions/banner.ts` lines 3 to 10 create the require function inside the `try`. That file is out of scope; read it, do not edit it.

```ts
const elysiaPkg: { version?: string } = (() => {
  try {
    const require = createRequire(import.meta.url)
    return require('elysia/package.json') as { version?: string }
  } catch {
    return {}
  }
})()
```

The nearest existing test is `__tests__/logger/bundled-app.test.ts`. It writes an app source into a temp directory inside the package (so the build resolves `elysia` and `pino`), bundles it with `bun build --target=bun`, and runs the bundle from a temp directory with no `node_modules` above it. It cannot see this fault: Bun's bundler writes ESM there and fills in `import.meta.url`. Even with `bun build --format=cjs --target=node`, Bun replaces `import.meta.url` with the build-time file URL, so the bundle runs. Bun does honor `--define import.meta.url=undefined`, and the bundle it then writes fails under `node` exactly as the esbuild bundle does. That is the reproduction this plan uses. esbuild is not a dependency of any workspace (it is only in `node_modules` through the docs site's dependencies), so the test must not use it.

`__tests__/_helpers/child-process.ts` (on `main` since commit `e017375`, after `c019a4f`) exports the timeout every test that starts a child process passes as its third argument:

```ts
export const CHILD_PROCESS_TIMEOUT_MS = 30_000
```

Tests that need `node` skip when it is missing, as in `__tests__/api/import-cost.test.ts` (`Bun.which('node') !== null`). CI runs on `ubuntu-latest`, which has `node`.

Conventions to match:

- Comments say why, never what. The existing comments above `loadChalk` and `gzipAsync` stay; extend them, do not restate the code.
- Regular expressions are top-level constants with the `u` flag.
- Tests use `bun:test`, keep `describe` nesting flat, and assert literal values a user could observe.

## Commands you will need

Run lint and format from the worktree root. Run the rest from the directory shown.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (root) | exit 0 |
| Build | `cd packages/logixlysia && bun run build` | `Build completed` |
| Lint | `bun run lint` (root) | exit 0 |
| Format | `bun run format` (root) | exit 0; read the diff it makes |
| Typecheck | `cd packages/logixlysia && bun run typecheck` | exit 0 |
| New test file | `cd packages/logixlysia && bun test ./__tests__/logger/commonjs-bundle.test.ts` | judge by pass and fail counts (exit is 1 on a subset because of the coverage threshold) |
| Related files | `cd packages/logixlysia && bun test ./__tests__/api/errors-subpath.test.ts ./__tests__/logger/lazy-chalk.test.ts ./__tests__/otel ./__tests__/output/rotation-manager.test.ts` | 0 fail |
| Full suite | `cd packages/logixlysia && bun test` | 0 fail |

The tests in this plan read `dist/`. Run the build after every source change and before every test run, or the tests prove nothing about your change.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/logger/create-logger.ts` (the `requireChalk` constant and `loadChalk` only)
- `packages/logixlysia/src/output/rotation-manager.ts` (the `requireBuiltin` constant and `gzipAsync` only)
- `packages/logixlysia/src/helpers/otel-api.ts` (the `requireOtel` constant and `getOtelApi` only)
- `packages/logixlysia/__tests__/logger/commonjs-bundle.test.ts` (create)
- `.changeset/commonjs-bundle-import.md` (create)

**Out of scope** (do NOT touch):

- `packages/logixlysia/src/extensions/banner.ts`. It is already safe, and another pull request is editing it.
- `packages/logixlysia/src/logger/load-pino.cjs` and how pino is loaded. It already works in a CommonJS bundle.
- `packages/logixlysia/bunup.config.ts`, `package.json` and the `exports` map. This plan does not add a CommonJS build or a `require` condition.
- A new way to load chalk, `node:zlib` or `@opentelemetry/api` that would make colors, compression or OpenTelemetry work in a CommonJS bundle. See "Maintenance notes".
- `__tests__/logger/bundled-app.test.ts`. The new tests go in their own file.
- Any docs page. No page describes bundling to CommonJS.

## Git workflow

- Branch: `fix/commonjs-bundle-import`, cut from the base commit your task names.
- Two commits, in this order:
  1. `fix(import): create require functions on first use so a CommonJS bundle loads` (the three source files and the new test file)
  2. `chore(changeset): note the CommonJS bundle import fix`
- Each commit body is one to three short paragraphs of plain prose: what a user saw, what the change does, what a reader would not guess from the diff (that colors, compression and OpenTelemetry stay off in such a bundle, and why `import()` is not used).
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Write the failing test

Confirm `packages/logixlysia/__tests__/_helpers/child-process.ts` exists and exports `CHILD_PROCESS_TIMEOUT_MS`. If it does not, STOP.

Create `packages/logixlysia/__tests__/logger/commonjs-bundle.test.ts` with this content:

```ts
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
// pino. The bundle runs from a temp dir with no node_modules above it.
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
```

Notes for this file:

- The app source uses `.then` and not a top-level `await`: a CommonJS bundle cannot hold a top-level `await`.
- `INFO  GET     / 200 ` (two spaces after `INFO`, five after `GET`) is the access line as the package prints it when stdout is not a terminal.
- The temp source directory uses the same `.bundle-test-` prefix as `bundled-app.test.ts`.

Then build and run it, before any source change:

**Verify**: `cd packages/logixlysia && bun run build && bun test ./__tests__/logger/commonjs-bundle.test.ts` reports `0 pass` and `3 fail`. Each failure shows a `Received:` value that starts with `node:internal/modules/cjs/loader` and contains `TypeError [ERR_INVALID_ARG_VALUE]: The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined`. If the three tests are skipped, `node` is not on `PATH`: STOP. If any test passes, or fails with a different message, STOP. Keep this output for your report.

### Step 2: Create each require function where its failure is already handled

Make three edits. Each moves the `createRequire(import.meta.url)` call from the module's top level into the code path that already catches the failure. Remove the top-level constant. Keep the `import { createRequire } from 'node:module'` line in each file.

`src/logger/create-logger.ts`: delete line 61 (`const requireChalk = createRequire(import.meta.url)`) and the blank line after it, and change `loadChalk` and its comment to:

```ts
// chalk detects color support as it loads, a third of this package's import
// time, so it loads when a text logger is created on a terminal and any other
// logger never pays for it. Node before 22.12 cannot require an ES module, and
// a CommonJS bundle leaves import.meta.url undefined so createRequire throws;
// either way the lines stay plain.
const loadChalk = (): ChalkInstance | null => {
  if (loadedChalk === undefined) {
    try {
      const requireChalk = createRequire(import.meta.url)
      loadedChalk = (requireChalk('chalk') as { default: ChalkInstance })
        .default
    } catch {
      loadedChalk = null
    }
  }
  return loadedChalk
}
```

`src/output/rotation-manager.ts`: delete line 15 (`const requireBuiltin = createRequire(import.meta.url)`) and the blank line after it, and change the comment and `gzipAsync` to:

```ts
// Required on first use because only a rotation that compresses needs them.
// A dynamic import() would do, but the bundler then links its runtime chunk
// into every entry, the dependency-free `logixlysia/errors` included. A
// CommonJS bundle leaves import.meta.url undefined, so createRequire throws
// here, where compressFile reports it, and not when the package is imported.
const gzipAsync = async (content: Buffer): Promise<Buffer> => {
  const requireBuiltin = createRequire(import.meta.url)
  const util = requireBuiltin('node:util') as { promisify: typeof Promisify }
  const zlib = requireBuiltin('node:zlib') as { gzip: typeof Gzip }
  return await util.promisify(zlib.gzip)(content)
}
```

`src/helpers/otel-api.ts`: delete line 18 (`const requireOtel = createRequire(import.meta.url)`) and the blank line after it, and change the `try` block in `getOtelApi` to:

```ts
  try {
    // A CommonJS bundle leaves import.meta.url undefined and createRequire
    // throws, which reads the same as OpenTelemetry not being installed.
    const requireOtel = createRequire(import.meta.url)
    otelApi = requireOtel('@opentelemetry/api') as OtelApi
  } catch {
    otelApi = null
  }
```

Do not change anything else in these three files.

**Verify**:

1. `grep -n "createRequire(import.meta.url)" packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/src/output/rotation-manager.ts packages/logixlysia/src/helpers/otel-api.ts` prints three lines, each indented (inside a function body), none starting at column 1 with `const`.
2. `cd packages/logixlysia && bun run build && bun test ./__tests__/logger/commonjs-bundle.test.ts` reports `3 pass` and `0 fail`.
3. `cd packages/logixlysia && bun test ./__tests__/api/errors-subpath.test.ts ./__tests__/logger/lazy-chalk.test.ts ./__tests__/otel ./__tests__/output/rotation-manager.test.ts` reports `0 fail`. If a test there fails after about 5 s with a timeout and passes when you run its file again, the machine is busy; that is not a STOP. Any other failure is a STOP.

### Step 3 (optional): Confirm with esbuild itself

Do this only if `node_modules/.bin/esbuild` exists at the worktree root. It reproduces the user's setup and is not part of the test suite. From `packages/logixlysia`, write a file `.cjs-check.ts` with:

```ts
import { Elysia } from 'elysia'
import logixlysia from './dist/index.js'
const app = new Elysia()
  .use(logixlysia({ config: { disableFileLogging: true, showStartupMessage: false } }))
  .get('/', ({ store }) => {
    store.pino.info('via pino')
    return 'ok'
  })
app.handle(new Request('http://localhost/')).then(response => console.log('status', response.status))
```

Then run `../../node_modules/.bin/esbuild .cjs-check.ts --bundle --platform=node --format=cjs --log-level=error --outfile=<a path outside the worktree>/cjs-check.cjs && node <same path>/cjs-check.cjs`, and delete `.cjs-check.ts`.

**Verify**: the output ends with an access line containing `INFO  GET     / 200 ` and the line `status 200`. `git status --porcelain` shows no `.cjs-check.ts`.

### Step 4: Changeset, gates, commits

Create `.changeset/commonjs-bundle-import.md`:

```md
---
'logixlysia': patch
---

<one short paragraph for a user of the package>
```

The paragraph must say, in your own plain words:

- the symptom: an app bundled to CommonJS (for example by esbuild with `--format=cjs`, as AWS CDK's `NodejsFunction` does by default) crashed at import with `TypeError [ERR_INVALID_ARG_VALUE]` from `createRequire`, since 6.14.0 for the package root (and for `logixlysia/otel` since it was added);
- what such a bundle gets now: it imports, handles requests, and writes console, file and `store.pino` lines (pretty printing included);
- what stays off in such a bundle: console colors, gzip compression of rotated files (the rotated file is kept and the failure is reported as a rotation error), and OpenTelemetry trace fields.

Then the gates, from the worktree root: `bun run format` (read its diff; it may only re-wrap lines you wrote), `bun run lint`. From `packages/logixlysia`: `bun run typecheck`, `bun run build`, `bun test`.

**Verify**: lint exit 0, typecheck exit 0, and the full suite reports `0 fail` with three more tests and one more file than before your change. Make the two commits from "Git workflow", staging files by name. `git status --porcelain` is empty afterwards (run `git checkout AGENTS.md` first if a tool modified it).

## Test plan

- New file `__tests__/logger/commonjs-bundle.test.ts` with three tests: the package root handles a request and logs it, `store.pino` pretty printing works, and `logixlysia/otel` imports. All three fail before Step 2 with the `createRequire` TypeError and pass after it.
- Existing tests that guard the constraints of this fix, all unchanged and still green: `__tests__/api/errors-subpath.test.ts` (no import in `dist/errors.js`), `__tests__/logger/lazy-chalk.test.ts` (chalk still loads only for a text logger on a terminal), `__tests__/otel/*` (OpenTelemetry fields when the API is present), `__tests__/output/rotation-manager.test.ts` (compression and its error path).
- No test asserts the compression failure inside a CommonJS bundle. That would pin a limitation a later change may lift.

## Done criteria

ALL must hold:

- [ ] Your report quotes the Step 1 run, made before any source change, with `0 pass` and `3 fail` and the `ERR_INVALID_ARG_VALUE` message
- [ ] `cd packages/logixlysia && bun test ./__tests__/logger/commonjs-bundle.test.ts` reports 3 pass, 0 fail
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` reports 0 fail
- [ ] `git diff <base>..HEAD --stat` lists exactly the five in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/__tests__/api` is empty (no API snapshot change)
- [ ] `grep -c "^const require" packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/src/output/rotation-manager.ts packages/logixlysia/src/helpers/otel-api.ts` prints 0 for each file

## STOP conditions

Stop and report (do not improvise) if:

- `__tests__/_helpers/child-process.ts` does not exist at your base commit.
- The code at the lines in "Current state" does not match, apart from the expected change after `resolveTimestampPattern` in `create-logger.ts`.
- Step 1 does not show 3 fail with the `ERR_INVALID_ARG_VALUE` message, or the tests are skipped.
- After Step 2 a test in the new file still fails with a `createRequire` error. Find the call in `dist/` with `grep -o ".\{60\}import\.meta\.url.\{60\}" packages/logixlysia/dist/*.js packages/logixlysia/dist/shared/*.js` and report which source file it comes from. Do not edit `src/extensions/banner.ts` or any file outside the in-scope list.
- `bundles with no dependency on a package or a node: module` in `__tests__/api/errors-subpath.test.ts` fails.
- `lazy-chalk.test.ts` fails for a reason other than a timeout. The chalk change must not change when chalk loads.

## Maintenance notes

- Any new `createRequire(import.meta.url)` must run inside the code path that handles its failure, never at a module's top level. The new test catches a top-level call reached from `logixlysia` or `logixlysia/otel`; a new subpath that adds one needs its own case in `commonjs-bundle.test.ts`.
- In a CommonJS bundle, colors, gzip compression and OpenTelemetry stay off after this plan. Possible later changes, not planned here: `process.getBuiltinModule('node:zlib')` would make compression work without `import.meta` (it exists on Bun 1.3.14 and on Node from 22.3; the package's `engines` says Node `>=22`, so a fallback is still needed below 22.3); a CommonJS shim like `src/logger/load-pino.cjs` would let a bundler pull chalk in. `@opentelemetry/api` is optional, so a static `require` of it would break bundling for apps that do not install it.
- An esbuild CommonJS bundle that calls `app.listen` with the `@elysiajs/node` adapter still crashes the same way, inside the `crossws` package that adapter brings, with or without this package. Apps that call `app.handle` or export `app.fetch` (the usual serverless shape) are not affected.
- A reviewer should check that each `createRequire` call now sits inside a `try` (chalk, OpenTelemetry) or inside a function whose only caller awaits it inside a `try` (`gzipAsync` in `compressFile`).
