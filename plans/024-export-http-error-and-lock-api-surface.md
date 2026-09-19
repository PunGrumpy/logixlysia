# Plan 024: Export `HttpError`, add the promised named export, and lock the published API surface

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 478f40d..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/package.json packages/logixlysia/bunfig.toml packages/logixlysia/__tests__ .github/workflows/release.yml turbo.json apps/docs/content/api-reference.mdx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (+ dx)
- **Planned at**: commit `478f40d`, 2026-09-19

## Why this matters

Release 6.8.0 shipped "structured errors" (`HttpError` with `code`/`why`/`fix`/`link`/`internal`) as a headline feature, documented it in the API reference, and changelogged it. The class was never exported from the package entry: the built `dist/index.js` exports nine names and `HttpError` is not among them. A user following the docs gets `undefined` at runtime. The tests never caught this because they import from `../../src/interfaces`, a path no consumer can use.

The README and the shipped agent skill both show `import { logixlysia } from 'logixlysia'`, a named export that also does not exist.

Both slipped because nothing pins the published surface. The package now has 14 subpath entries and no contract test, so this class of regression is invisible to CI. This plan fixes the two export gaps, adds a snapshot test over every `exports` subpath so it cannot recur, and closes two small publish-hygiene gaps found alongside: the release workflow publishes without running tests, and the tarball ships without a LICENSE file.

## Current state

Files and roles:

- `packages/logixlysia/src/index.ts` — plugin factory and the package's root barrel. Lines 281–320 are the export block.
- `packages/logixlysia/src/interfaces.ts` — compatibility barrel; line 2 re-exports `HttpError` as a value, but the root barrel only re-exports *types* from it.
- `packages/logixlysia/src/errors.ts` — defines `HttpError`, `HttpErrorInit`, `HttpErrorPayload` (all exported from that module).
- `packages/logixlysia/package.json` — `exports` map (14 subpaths), `files: ["dist", "README.md"]`.
- `packages/logixlysia/bunup.config.ts` — 14 build entries matching the exports map.
- `.github/workflows/release.yml` — builds and publishes; runs no tests.
- `apps/docs/content/api-reference.mdx` — documents `HttpError` (lines ~200–265) with no import line.

Root barrel today (`packages/logixlysia/src/index.ts:281–320`):

```ts
// biome-ignore lint/performance/noBarrelFile: public package entry re-exports
export { resolveOptions } from './config/resolve-options'
export { useLogger } from './context/storage'
export type {
  Enricher,
  EnricherFields,
  EnricherLike,
  EnricherResponseInput,
  HeadSamplingConfig,
  LogFields,
  Logger,
  LogixlysiaContext,
  LogixlysiaStore,
  LogLevel,
  LogPreset,
  Options,
  Pino,
  RequestIdConfig,
  RequestScopedLogger,
  SamplingConfig,
  StoreData,
  TailSamplingConfig,
  Transport
} from './interfaces'
export { createLogger, createPluginLogger } from './logger'
export type { ResolvedRequestIdConfig } from './middleware/request-id'
export {
  getOrCreateRequestId,
  resolveRequestIdConfig
} from './middleware/request-id'
export type {
  RequestOutcome,
  SamplingDecision,
  SamplingRuntime
} from './sampling'
export { resolveSampling } from './sampling'
export type { WsHandlerHooks } from './websocket/wrap-ws'
export { createWsHandlerWrapper } from './websocket/wrap-ws'

export default logixlysia
```

Built entry's named exports today (from `dist/index.js` after `bun run build`):

```
createLogger, createPluginLogger, createWsHandlerWrapper, default,
getOrCreateRequestId, resolveOptions, resolveRequestIdConfig, resolveSampling, useLogger
```

`interfaces.ts:1–2`:

```ts
// biome-ignore lint/performance/noBarrelFile: compatibility barrel
export { HttpError } from './errors'
```

Tests import the class from source (`__tests__/errors/http-error.test.ts:5`, `__tests__/plugin/logixlysia.test.ts:5`, `__tests__/utils/redact.test.ts:2`):

```ts
import { HttpError } from '../../src/interfaces'
```

README (`packages/logixlysia/README.md:17`, symlinked to the repo root) and the skill (`skills/logixlysia/SKILL.md:18`) both show:

```ts
import logixlysia from 'logixlysia' // or import { logixlysia } from 'logixlysia'
```

`package.json` `files` (line ~102): `["dist", "README.md"]`. There is no `LICENSE` file in `packages/logixlysia/`; the only one is at the repo root. `npm pack --dry-run` from the package directory lists 32 files, none of them a license.

`release.yml` job steps (lines 21–58): checkout → setup node/bun → cache → `bun install` → `bun run build --filter logixlysia` → `changesets/action` (publish-script `bun run changeset publish`) → Vercel deploy. No lint, typecheck, or test step. `validate.yml` runs on the same `push: main` event concurrently, so a red validate does not block a publish.

`turbo.json` `test` task: `{ "dependsOn": ["^test"] }` — no dependency on `build`, so `dist/` may be absent or stale when tests run.

Conventions:

- Formatting/lint: Biome via `ultracite`; single quotes, no semicolons, no trailing commas, `arrowParentheses: asNeeded`. Run `bun run format` after editing.
- Tests: `bun:test`; files under `packages/logixlysia/__tests__/<area>/<name>.test.ts`; `describe`/`test`; helpers in `__tests__/_helpers/`.
- Any change to `packages/logixlysia/` needs a changeset file in `.changeset/` (see Git workflow).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` (repo root) | exit 0 |
| Build package | `cd packages/logixlysia && bun run build` | `✓ Build completed`, `dist/*.js` for 14 entries |
| Typecheck | `bun run typecheck` (repo root) | `Tasks: 5 successful` |
| Lint | `bun run lint` (repo root) | `Checked N files … No fixes applied.` (exit 0) |
| Format | `bun run format` (repo root) | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | `395 pass` today; more after this plan |
| One test file | `cd packages/logixlysia && bun test __tests__/api/surface.test.ts` | all pass |
| Tarball check | `cd packages/logixlysia && npm pack --dry-run` | file list printed |

## Scope

**In scope** (the only files you should modify or create):

- `packages/logixlysia/src/index.ts`
- `packages/logixlysia/__tests__/errors/http-error.test.ts` (retarget import)
- `packages/logixlysia/__tests__/api/surface.test.ts` (create)
- `packages/logixlysia/__tests__/api/__snapshots__/` (created by the test runner)
- `packages/logixlysia/package.json` (`files` only)
- `packages/logixlysia/LICENSE` (create; copy of root `LICENSE`)
- `turbo.json` (`test` task only)
- `.github/workflows/release.yml`
- `apps/docs/content/api-reference.mdx` (import line only)
- `packages/logixlysia/README.md` (line 17 only)
- `.changeset/<slug>.md` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- `skills/logixlysia/SKILL.md` and the rest of the docs — plan 029 rewrites them; only the one README line and the one api-reference import line are fixed here.
- `packages/logixlysia/src/interfaces.ts` — keep the compatibility barrel as is.
- `bunup.config.ts` — do not add a separate `errors` entry; `HttpError` goes out through the root entry.
- Any change to `HttpError`'s behaviour or shape.

## Git workflow

- Branch: `improve/024-export-http-error-and-lock-api-surface` off `main`.
- Conventional commits, one logical change each, e.g. `fix(exports): export HttpError and a named logixlysia export`, `test(api): snapshot the published export surface`, `ci(release): gate publish on lint, typecheck and tests`, `chore(package): ship LICENSE in the tarball`.
- Do NOT add a `Co-Authored-By: Claude` trailer.
- Changeset (required — this touches the published package). Create `.changeset/export-http-error.md`:

  ```markdown
  ---
  'logixlysia': minor
  ---

  Export `HttpError` (with `HttpErrorInit` and `HttpErrorPayload` types) and a named `logixlysia` export from the package entry, as the docs and README already describe. Ship the LICENSE file in the npm tarball.
  ```

- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the missing value exports to the root barrel

In `packages/logixlysia/src/index.ts`, inside the export block (after the `export { useLogger } from './context/storage'` line), add:

```ts
export { HttpError } from './errors'
export type { HttpErrorInit, HttpErrorPayload } from './errors'
```

And immediately before `export default logixlysia`, add a named export of the factory:

```ts
export { logixlysia }
```

Keep Biome's sorted-export ordering: run `bun run format` and accept whatever ordering it applies.

**Verify**: `cd packages/logixlysia && bun run build && node -e "import('./dist/index.js').then(m => console.log(Object.keys(m).sort().join(',')))"` → output contains `HttpError` and `logixlysia` alongside the nine existing names.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Retarget the HttpError tests at the public entry

In `packages/logixlysia/__tests__/errors/http-error.test.ts`, change the import from `'../../src/interfaces'` to `'../../src'` so the test asserts the public contract. Leave the other two test files' imports alone (they import `Options` from interfaces too; not worth churning).

**Verify**: `cd packages/logixlysia && bun test __tests__/errors` → all pass.

### Step 3: Make the test task depend on a fresh build

In `turbo.json`, change the `test` task to:

```json
"test": {
  "dependsOn": ["^test", "build"]
}
```

This guarantees `dist/` is current whenever `bun run test` runs from the root (CI uses `bun run test`). Running `bun test` directly inside the package still works but will use whatever `dist/` exists; Step 4's test skips itself when `dist/` is missing.

**Verify**: `bun run test` (repo root) → turbo shows `logixlysia:build` running before `logixlysia:test`, all pass.

### Step 4: Add the API-surface snapshot test

Create `packages/logixlysia/__tests__/api/surface.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import packageJson from '../../package.json'

const packageRoot = join(import.meta.dir, '..', '..')
const distReady = existsSync(join(packageRoot, 'dist', 'index.js'))

type ExportEntry = string | { import?: string; types?: string; default?: string }

const subpaths = Object.entries(
  packageJson.exports as Record<string, ExportEntry>
).filter(([key, value]) => key !== './package.json' && typeof value !== 'string')

describe('published API surface', () => {
  test.skipIf(!distReady)('every exports subpath resolves and its named exports match the snapshot', async () => {
    const surface: Record<string, string[]> = {}
    for (const [subpath, entry] of subpaths) {
      const target = typeof entry === 'string' ? entry : entry.import
      if (!target) {
        throw new Error(`exports["${subpath}"] has no import target`)
      }
      const mod = (await import(join(packageRoot, target))) as Record<string, unknown>
      surface[subpath] = Object.keys(mod).sort()
    }
    expect(surface).toMatchSnapshot()
  })

  test('every bunup entry has an exports subpath and vice versa', async () => {
    const bunupConfig = (await import('../../bunup.config')).default as { entry: string[] }
    const built = bunupConfig.entry
      .map(file => file.replace(/^src\//, '').replace(/\.ts$/, ''))
      .map(name => (name === 'index' ? '.' : `./${name}`))
      .sort()
    const declared = subpaths.map(([key]) => key).sort()
    expect(built).toEqual(declared)
  })
})
```

Notes for the executor:

- `bun test` writes the snapshot on first run to `__tests__/api/__snapshots__/surface.test.ts.snap`. Commit it. Open it and confirm the `"."` entry lists `HttpError` and `logixlysia`.
- If importing `bunup.config` pulls in `bunup` and fails at test time, replace the dynamic import with a small regex read of the file text (`readFileSync` + match `'src/(\w[\w-]*)\.ts'`) — the goal is only the list of entry names.
- If `import packageJson from '../../package.json'` fails to typecheck, use `JSON.parse(readFileSync(...))` instead.

**Verify**: `cd packages/logixlysia && bun run build && bun test __tests__/api` → 2 pass, snapshot file created.

**Verify**: temporarily remove `export { logixlysia }` from `src/index.ts`, rebuild, rerun → the snapshot test FAILS. Restore the export, rebuild, rerun → passes. (This proves the gate works.)

### Step 5: Ship the LICENSE in the tarball

Copy the repo-root `LICENSE` to `packages/logixlysia/LICENSE` (a real copy, not a symlink — npm does not follow symlinks reliably). Add `"LICENSE"` and `"CHANGELOG.md"` to the `files` array in `packages/logixlysia/package.json`:

```json
"files": [
  "dist",
  "README.md",
  "LICENSE",
  "CHANGELOG.md"
]
```

**Verify**: `cd packages/logixlysia && npm pack --dry-run 2>&1 | grep -E "LICENSE|CHANGELOG"` → both listed.

### Step 6: Gate the release on the quality checks

In `.github/workflows/release.yml`, insert a step between `🔽 Install Dependencies` and `🦊 Build Logixlysia`:

```yaml
      - name: 🔍 Lint, typecheck and test
        env:
          CI: true
        run: |
          bun run lint
          bun run typecheck
          bun run test
```

Keep the existing build step (the publish script rebuilds anyway; leaving it is harmless).

**Verify**: `bunx yaml-lint .github/workflows/release.yml` if available, otherwise `node -e "require('js-yaml')"` is not guaranteed — at minimum run `bun x js-yaml .github/workflows/release.yml > /dev/null` or visually confirm indentation matches the sibling steps (6 spaces before `- name:`). The workflow cannot be executed locally; the reviewer checks it in the PR's Actions run.

### Step 7: Fix the two wrong import examples and the docs import line

- `packages/logixlysia/README.md:17` — leave as is now that the named export exists (Step 1 made the comment true). Do not edit unless Step 1 was changed.
- `apps/docs/content/api-reference.mdx` — in the `HttpError` section, add an import line above the example code block:

  ```ts
  import { HttpError } from 'logixlysia'
  ```

**Verify**: `grep -n "import { HttpError } from 'logixlysia'" apps/docs/content/api-reference.mdx` → one match.

### Step 8: Changeset, format, full verification

Create the changeset from the Git workflow section. Run `bun run format`, then the full gate.

**Verify**: `bun run lint && bun run typecheck && bun run test` → all exit 0; test count is 395 + 2.

## Test plan

- New: `__tests__/api/surface.test.ts` — (a) snapshot of named exports per `exports` subpath from `dist/`; (b) bunup entries ⇔ exports subpaths parity.
- Modified: `__tests__/errors/http-error.test.ts` imports from the package root.
- Pattern to model after: `__tests__/adapters/shared.test.ts` for describe/test layout.
- Verification: `cd packages/logixlysia && bun run build && bun test` → all pass including the two new tests.

## Done criteria

- [ ] `node -e "import('./packages/logixlysia/dist/index.js').then(m=>console.log('HttpError' in m, 'logixlysia' in m))"` (from repo root, after build) prints `true true`
- [ ] `packages/logixlysia/__tests__/api/__snapshots__/surface.test.ts.snap` exists and is committed
- [ ] `bun run lint`, `bun run typecheck`, `bun run test` all exit 0
- [ ] `npm pack --dry-run` in the package lists `LICENSE`
- [ ] `.github/workflows/release.yml` contains a step running `bun run test` before the changesets action
- [ ] `.changeset/export-http-error.md` exists
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `dist/index.js` already exports `HttpError` or `logixlysia` at the start (the gap was fixed independently; the snapshot test is still worth adding — report and ask).
- The `exports` map in `package.json` has gained or lost subpaths relative to the 14 listed in `bunup.config.ts` (parity test will fail for a reason outside this plan).
- Adding `"build"` to the `test` task's `dependsOn` makes `bun run test` fail for `apps/docs` or `apps/elysia` (they may lack a `build` script); in that case scope the dependency with `"logixlysia#build"` syntax and report which form you used.
- The snapshot test cannot import `dist/*.js` because of an ESM/Bun resolution error you cannot fix by adjusting the path join.

## Maintenance notes

- Every intentional export change now requires updating the snapshot (`bun test --update-snapshots` inside the package). That friction is the point; a reviewer should treat a snapshot diff as an API review.
- When an adapter is added: bunup entry + `exports` subpath + snapshot update, or the parity test fails. Plan 029 adds a contributor checklist that mentions this.
- The release gate re-runs the same three commands as `validate.yml`; if they diverge later, prefer converting `validate.yml`'s `code-quality` job into a reusable workflow and `needs:`-ing it.
- Deferred: a `logixlysia/errors` subpath was considered and rejected — the root export is the discoverable place, and a 15th subpath would need docs, bunup, and snapshot changes for no consumer benefit.
