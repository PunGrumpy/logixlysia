# Plan 057: Ship HttpError's docs and keep the OTel test hook out of the public API

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b2a8244..HEAD -- packages/logixlysia/src/errors.ts packages/logixlysia/src/types/config.ts packages/logixlysia/src/extensions packages/logixlysia/src/helpers packages/logixlysia/src/otel.ts packages/logixlysia/__tests__/otel packages/logixlysia/__tests__/ai packages/logixlysia/__tests__/api` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `b2a8244`, 2026-10-23

## Why this matters

Two public-surface problems hide behind comments. `HttpError`'s class documentation sits above an unrelated constant in `src/errors.ts`, so TypeScript attaches it there and `dist/index.d.ts` ships `declare class HttpError` with no doc at all: users get no hover help for the package's main error type. And `logixlysia/otel` exports `__resetForTesting`, a test hook whose only defence is a comment saying "Only intended for tests"; it is in the published API snapshot. Moving the doc and moving the hook into an internal module fixes both, and a handful of comments that restate the code go with them.

## Current state

- `packages/logixlysia/src/errors.ts:31-51`: the `HttpError` class TSDoc (starts `/**` then ` * An HTTP error carrying the context that makes a failure actionable.`) is followed at `:52-55` by a second doc block and `const NULL_BODY_STATUSES`, so the class doc attaches to the constant. `export class HttpError extends Error {` is at `:69`. Confirmed in a build at `b2a8244`: the 12 lines before `declare class HttpError` in `dist/index.d.ts` are `HttpErrorInit` fields, with no class doc.
- The class doc contains this time-relative sentence that must change while moving:

```ts
 * A bare `new HttpError(404, 'Not found')` behaves exactly as before: the
 * response body is the plain message. Only an error that carries at least one
 * client-facing field responds as JSON.
```

- `packages/logixlysia/src/types/config.ts:119-122` documents the object form of `requestId` with a sentence about the boolean form:

```ts
  /**
   * Enable request ID generation.
   * When used as a boolean on `Options.config.requestId`, `true` enables with defaults.
   */
  enabled?: boolean
```

What the code does (`packages/logixlysia/src/middleware/request-id.ts:44-46`): in the object form, `enabled: false` disables request IDs, anything else enables them.

- `packages/logixlysia/src/otel.ts:1-31` holds the cached OTel API loader (`createRequire`, `interface OtelApi`, `let otelApi`, `getOtelApi`) and `:61-68` the exported hook:

```ts
/**
 * Reset the cached OTel API reference. Only intended for tests.
 *
 * @internal
 */
export const __resetForTesting = (): void => {
  otelApi = undefined
}
```

- Its only caller is `packages/logixlysia/__tests__/otel/otel-mock.test.ts` (`import { __resetForTesting, injectTraceContext } from '../../src/otel'`, called in `afterEach` and at the start of tests). The API snapshot `packages/logixlysia/__tests__/api/__snapshots__/surface.test.ts.snap` lists `"./otel": ["__resetForTesting", "injectTraceContext"]`.
- `packages/logixlysia/src/helpers/` holds internal, non-entry modules (`status.ts`); the build entries are listed explicitly in `packages/logixlysia/bunup.config.ts`, so a new file there is not published as an entry.

### Repo facts

- Bun 1.3.14 workspaces with Turborepo. The published package is `packages/logixlysia`, an Elysia logging plugin. Other workspaces: `apps/docs` (the Blume docs site), `apps/elysia` (a playground app), `packages/bench` (vitest benchmarks), `packages/video` (a Remotion promo).
- Lint and format are Ultracite (oxlint and oxfmt). `bun run lint` runs both and fails on any finding. Rules that shape this plan:
  - `no-empty` is an error: a block needs a statement or a comment. Never delete the only comment inside a `catch {}` or a function body unless a step here says what replaces it.
  - `typescript/ban-ts-comment` is an error and requires a description after every `@ts-expect-error`. Do not touch those lines.
  - `typescript/consistent-type-definitions` is an error: object types stay `interface`.
  - `promise/prefer-await-to-then` is an error in `src/` and off under `__tests__/`.
  - `unicorn/no-useless-undefined`, `no-useless-return`, `no-use-before-define` and `func-style` are errors.
  - Never turn a rule off and never add an `oxlint-disable` comment. If lint rejects a change, restructure the code. If you cannot, STOP.
- `turbo` appends a block marked `<!-- BEGIN:turborepo-agent-rules -->` to `AGENTS.md` when it detects an AI agent. That change is not part of this plan: run `git checkout -- AGENTS.md` before every commit and never stage `AGENTS.md`.
- Every comment this plan deletes was read against the code at `b2a8244` and judged to restate it, narrate it, or carry history. The comments left in place were judged to carry a reason the code cannot show (a dependency or protocol quirk, a public API contract, a lint-required marker). Do not delete anything that is not listed, and do not keep anything that is.

## Commands you will need

| Purpose | Command (worktree root unless noted) | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | `703 pass`, `0 fail` once this plan is done (`703 pass` at `b2a8244`) |
| Build | `bun run build` | exit 0 |

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/errors.ts`
- `packages/logixlysia/src/types/config.ts` (only the `RequestIdConfig.enabled` doc)
- `packages/logixlysia/src/extensions/banner.ts`, `packages/logixlysia/src/helpers/status.ts` (Step 1 only)
- `packages/logixlysia/src/helpers/otel-api.ts` (create)
- `packages/logixlysia/src/otel.ts`
- `packages/logixlysia/__tests__/otel/otel-mock.test.ts`, `packages/logixlysia/__tests__/ai/ai.test.ts`
- `packages/logixlysia/__tests__/api/__snapshots__/surface.test.ts.snap` (regenerated, one line removed)
- `.changeset/public-api-docs-and-otel-hook.md` (create)

**Out of scope** (do NOT touch):

- `packages/logixlysia/src/types/enricher.ts` and `packages/logixlysia/src/types/core.ts` (other plans).
- `packages/logixlysia/src/index.ts` and everything else.
- The `@ts-expect-error` lines anywhere: their descriptions are required by lint.

## Git workflow

- Branch: `improve/057-public-api-docs-and-otel-hook`, created in Step 0 from `b2a8244`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(logger): log the status the client actually got`).
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git switch -c improve/057-public-api-docs-and-otel-hook`. If that branch already exists, STOP.
2. `bun install --frozen-lockfile` → exit 0.
3. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
4. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`. If any fails before you changed anything, STOP.
5. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

A script deletes exact line ranges so none is mistyped. It refuses to write anything if a range does not start with the expected text or is not a whole comment.

1. `mkdir -p /tmp/prune-057`. Save Appendix A verbatim as `/tmp/prune-057/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-057/spec.txt`.
2. From the worktree root: `bun /tmp/prune-057/prune-comments.ts /tmp/prune-057/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `b2a8244`: STOP and report it.
3. `bun /tmp/prune-057/prune-comments.ts /tmp/prune-057/spec.txt` → `removed 25 comment lines across 5 files`.
4. `bun run format` → exit 0. It folds a now-empty multi-line body such as `() => {\n}` into `() => {}`.
5. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `703 pass`, `0 fail`.
6. `git checkout -- AGENTS.md`. `git status --short` lists only files that appear in Appendix B.
7. **Commit**: `chore(api): drop comments that restate the code`

**Verify**: `git show --stat HEAD` → 5 files. `git show HEAD | grep '^+' | grep -v '^+++'` prints only lines the formatter re-folded (no new words).

### Step 2: Attach the HttpError doc to the class

In `packages/logixlysia/src/errors.ts`, cut the whole block from the `/**` above ` * An HTTP error carrying the context that makes a failure actionable.` through the ` */` after ` * client-facing field responds as JSON.` Paste it directly above `export class HttpError extends Error {`. While moving it, replace the three lines quoted under "Current state" with:

```ts
 * A bare `new HttpError(404, 'Not found')` responds with the plain message.
 * Only an error that carries at least one client-facing field responds as
 * JSON.
```

**Verify**:

1. `bun run lint` → exit 0.
2. `bun run build --filter logixlysia` → exit 0.
3. `grep -c 'An HTTP error carrying the context' packages/logixlysia/dist/index.d.ts` → `1`.
4. `grep -n -B2 'declare class HttpError' packages/logixlysia/dist/index.d.ts` → the line right above `declare class HttpError` ends the doc comment (`*/`).

**Commit**: `docs(errors): attach the HttpError doc to the class so it ships`

### Step 3: Say what `requestId.enabled` does

In `packages/logixlysia/src/types/config.ts`, replace the `enabled` doc quoted under "Current state" with:

```ts
/**
 * Set to `false` to turn request IDs off while keeping the object form.
 * @default true
 */
```

**Verify**: `bun run lint` → exit 0.

**Commit**: `docs(config): say what requestId.enabled does in the object form`

### Step 4: Move the OTel loader and its reset into an internal module

1. Create `packages/logixlysia/src/helpers/otel-api.ts`:

```ts
import { createRequire } from 'node:module'

export interface OtelApi {
  context: { active: () => unknown }
  trace: {
    getSpan: (
      ctx: unknown
    ) => { spanContext: () => { traceId: string; spanId: string } } | undefined
  }
}

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

export const resetOtelApi = (): void => {
  otelApi = undefined
}
```

2. In `packages/logixlysia/src/otel.ts`: delete `import { createRequire } from 'node:module'`, `const requireOtel = ...`, `interface OtelApi {...}`, `let otelApi ...`, `const getOtelApi = ...`, and the `__resetForTesting` export with its doc block. Add `import { getOtelApi } from './helpers/otel-api'`. Keep `TraceContextFields` and `injectTraceContext` (with its doc) unchanged.
3. In `packages/logixlysia/__tests__/otel/otel-mock.test.ts`: import `injectTraceContext` from `'../../src/otel'` and `resetOtelApi` from `'../../src/helpers/otel-api'`; replace every `__resetForTesting()` call with `resetOtelApi()`.
4. `bun run format` → exit 0.

**Verify**:

1. `grep -rn "__resetForTesting" packages/logixlysia/src packages/logixlysia/__tests__ apps` → no output.
2. `cd packages/logixlysia && bun test __tests__/otel` → all pass (the `mock.module('@opentelemetry/api', ...)` mock still reaches the loader).
3. `bun run build --filter logixlysia`, then `cd packages/logixlysia && bun test --update-snapshots __tests__/api` → pass.
4. `git diff packages/logixlysia/__tests__/api` → exactly one removed line, `"__resetForTesting",`, under `"./otel"`. Anything else: STOP.
5. `bun run lint` and `bun run typecheck` → exit 0.

**Commit**: `refactor(otel): keep the test-only cache reset out of the public entry`

### Step 5: Add the changeset

Create `.changeset/public-api-docs-and-otel-hook.md`:

```md
---
'logixlysia': patch
---

`HttpError`'s documentation now ships in the type declarations, so editors show it on hover. It had been attached to an internal constant instead of the class.

`logixlysia/otel` no longer exports `__resetForTesting`. It reset an internal cache for the package's own tests, was marked `@internal`, and was never documented.
```

**Commit**: `chore: add a changeset for the public API cleanup`

### Step 6: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B b2a8244..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff b2a8244..HEAD | grep -c '^+.*oxlint-disable'` → `0`.

## Test plan

- No new tests. Existing coverage proves the change: `__tests__/otel/*` exercise the moved loader through the mock, and `__tests__/api/surface.test.ts` pins the export list (regenerated in Step 4 with exactly one line removed).
- The `HttpError` doc move is verified against the built `dist/index.d.ts` (Step 2).

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`
- [ ] `git diff --name-only b2a8244..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)
- [ ] `grep -c 'An HTTP error carrying the context' packages/logixlysia/dist/index.d.ts` → `1` after `bun run build`
- [ ] `grep -rn "__resetForTesting" packages/logixlysia/src packages/logixlysia/__tests__` → no output
- [ ] The snapshot diff removes exactly one line

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `b2a8244`).
- A verification fails twice after a reasonable fix attempt.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.
- The otel tests fail after Step 4 because the mock no longer reaches the moved loader. Do not restructure further: report.
- The regenerated API snapshot differs by anything other than the one `__resetForTesting` line.

## Maintenance notes

- Removing `__resetForTesting` from `logixlysia/otel` is, strictly, removing an export. It was `__`-prefixed, `@internal` and undocumented, so the plan ships it as a patch. A maintainer who wants strict semver can change the changeset to `minor`.
- `helpers/otel-api.ts` is internal: never add it to `bunup.config.ts` entries or `package.json` exports.

## Appendix A: `prune-comments.ts`

```ts
// Deletes exact comment line ranges listed in a spec, bottom-up per file.
// Spec lines: <path>|<start>|<end>|<expected prefix of the trimmed start line>
// Usage: bun prune-comments.ts <spec-file> [--dry-run]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [specPath, flag] = process.argv.slice(2)
if (!specPath) {
  console.error('usage: bun prune-comments.ts <spec-file> [--dry-run]')
  process.exit(2)
}
const dryRun = flag === '--dry-run'
const root = process.cwd()

interface Range {
  end: number
  expected: string
  start: number
}

const byFile = new Map<string, Range[]>()
for (const raw of readFileSync(specPath, 'utf8').split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith(';')) {
    continue
  }
  const [file, start, end, ...rest] = line.split('|')
  const range = {
    end: Number(end),
    expected: rest.join('|').trim(),
    start: Number(start)
  }
  if (!file || !Number.isInteger(range.start) || range.end < range.start) {
    console.error(`bad spec line: ${raw}`)
    process.exit(2)
  }
  const list = byFile.get(file) ?? []
  list.push(range)
  byFile.set(file, list)
}

const LINE_MARKERS = ['//', '#']
const isBlank = (text: string | undefined): boolean =>
  text !== undefined && text.trim() === ''

const checkShape = (lines: string[]): string | undefined => {
  const first = lines[0]?.trim() ?? ''
  const last = lines.at(-1)?.trim() ?? ''
  const marker = LINE_MARKERS.find(m => first.startsWith(m))
  if (marker) {
    const stray = lines.find(l => !l.trim().startsWith(marker))
    return stray === undefined ? undefined : `non-comment line: ${stray.trim()}`
  }
  if (first.startsWith('/*') && last.endsWith('*/')) {
    return
  }
  if (first.startsWith('<!--') && last.endsWith('-->')) {
    return
  }
  return `range is not a whole comment: "${first}" ... "${last}"`
}

let failures = 0
const planned = new Map<string, { lines: string[]; ranges: Range[] }>()
for (const [file, ranges] of byFile) {
  const lines = readFileSync(path.join(root, file), 'utf8').split('\n')
  ranges.sort((a, b) => b.start - a.start)
  for (const range of ranges) {
    const slice = lines.slice(range.start - 1, range.end)
    const head = slice[0]?.trim() ?? ''
    const problem = head.startsWith(range.expected)
      ? checkShape(slice)
      : `expected "${range.expected}", found "${head}"`
    if (problem) {
      failures += 1
      console.error(`MISMATCH ${file}:${range.start}-${range.end}: ${problem}`)
    } else if (dryRun) {
      console.log(`${file}:${range.start}-${range.end}`)
      for (const text of slice) {
        console.log(`    ${text}`)
      }
    }
  }
  planned.set(file, { lines, ranges })
}

if (failures > 0) {
  console.error(`${failures} range(s) did not match. No file was changed.`)
  process.exit(1)
}
if (dryRun) {
  console.log('dry run ok')
  process.exit(0)
}

let removed = 0
for (const [file, { lines, ranges }] of planned) {
  for (const range of ranges) {
    lines.splice(range.start - 1, range.end - range.start + 1)
    if (isBlank(lines[range.start - 2]) && isBlank(lines[range.start - 1])) {
      lines.splice(range.start - 1, 1)
    }
    removed += range.end - range.start + 1
  }
  writeFileSync(path.join(root, file), lines.join('\n'))
}
console.log(`removed ${removed} comment lines across ${planned.size} files`)
```

## Appendix B: deletion spec (`path|start|end|expected start of the first line`)

```text
packages/logixlysia/src/errors.ts|61|61|/** Falls back to 500 for a status `Response.jso
packages/logixlysia/src/errors.ts|92|94|// Set explicitly — a native subclass otherwise
packages/logixlysia/src/errors.ts|98|100|// Non-enumerable so `JSON.stringify`, spreads,
packages/logixlysia/src/errors.ts|108|111|// Elysia renders a thrown error with `toRespons
packages/logixlysia/src/extensions/banner.ts|36|38|/**
packages/logixlysia/src/helpers/status.ts|12|15|// Handles common variants:
packages/logixlysia/__tests__/otel/otel-mock.test.ts|18|19|// Mock @opentelemetry/api so that createRequire
packages/logixlysia/__tests__/otel/otel-mock.test.ts|27|27|// Reset the module-level cache so each test sta
packages/logixlysia/__tests__/otel/otel-mock.test.ts|35|35|// Reset cache so it re-resolves from the mock
packages/logixlysia/__tests__/ai/ai.test.ts|11|11|/* noop */
packages/logixlysia/__tests__/ai/ai.test.ts|49|49|/* noop */
packages/logixlysia/__tests__/ai/ai.test.ts|93|93|/* noop */
```
