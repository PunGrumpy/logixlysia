# Plan 060: Prune the utils, output and sampling comments and correct the ones that stay

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b2a8244..HEAD -- packages/logixlysia/src/utils packages/logixlysia/src/output packages/logixlysia/src/sampling packages/logixlysia/__tests__/utils packages/logixlysia/__tests__/output packages/logixlysia/__tests__/sampling` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b2a8244`, 2026-10-23

## Why this matters

The redaction, file output and sampling modules carry about 190 comment lines that restate their code (`// Use Promise.allSettled to handle individual file stat failures gracefully` above a `Promise.allSettled` call, docs that repeat a constant's name). Some comments that stay are false: the file sink promises writes are "durably on disk" though nothing calls fsync, the control-character check's doc says tab and LF are included when the code excludes them, and the pino redact-paths doc says "one key" for a function that builds paths for every key. A few test helpers are duplicated or need a comment to explain a magic value. This plan removes the noise, makes the remaining comments true, and lets names carry what the test comments explained.

## Current state

- Deletions: Appendix B lists 110 ranges (191 lines) in 21 files.
- `packages/logixlysia/src/utils/sanitize.ts:3-10`:

```ts
/**
 * True for C0 controls (0x00-0x08, 0x0B-0x1F), DEL (0x7F), and C1 controls
 * (0x80-0x9F). Tab, LF, and CR are handled separately by the caller before
 * this check runs, so they are intentionally included here as a safety net
 * in case a caller skips that step.
 */
const isControlCodePoint = (code: number): boolean =>
  code <= 8 || (code >= 11 && code <= 31) || (code >= 127 && code <= 159)
```

The predicate excludes 9 (tab) and 10 (LF); CR (13) is inside `11..31`.

- `packages/logixlysia/src/output/file-sink.ts:29-36` (`interface FileSink`):

```ts
/** Resolves once every write issued so far is durably on disk. */
flush: () => Promise<void>
/** Resolves after `line` is durably written to disk. */
write: (line: string, options: FileSinkOptions) => Promise<void>
```

and `:187-188` in `maybeRotate`'s catch:

```ts
// Log entries were already durably written and resolved above;
// rotation failures must not fail the caller's write.
```

No `fsync`/`sync` call exists under `packages/logixlysia/src/output` (`grep -rn "sync(" packages/logixlysia/src/output` → only `existsSync`-style names, if any).

- `packages/logixlysia/src/utils/redact.ts:120`: `/** pino redact paths for one key: top-level and one nesting level. */` above `buildPinoRedactPaths`, which maps every default and extra key.
- `packages/logixlysia/src/utils/redact.ts:242-248` (`redactPathSegment`, after Step 1 deletes its doc):

```ts
const redactPathSegment = (segment: string): string => {
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    // Malformed escape: redact the raw segment instead.
  }
  const redacted = redactString(decoded)
```

`redact.test.ts:583` pins the `%40` case the deleted doc described.

- `packages/logixlysia/src/output/index.ts:94-96` (`runTransportLifecycle`):

```ts
    try {
      // Yield first so the method is called from a microtask, never inline.
      await Promise.resolve()
```

- Tests: `permBits` is defined identically in `packages/logixlysia/__tests__/output/file.test.ts:11` and `rotation-manager.test.ts:14` (`const permBits = (mode: number): string => mode.toString(8).slice(-3)`; Step 1 deletes the doc above each). `packages/logixlysia/__tests__/sampling/runtime.test.ts:5-12` has `/** Returns each value in turn, then repeats the last one. */ const sequence = ...`, used once at `:51` under the comment `// 0.05 -> 5 < 10 (kept); 0.5 -> 50 >= 10 (dropped)`. `packages/logixlysia/__tests__/output/interval-rotation.test.ts:15-18` and `:62-65` reset the clock with a comment each (`setSystemTime()`). `packages/logixlysia/__tests__/output/file.test.ts:378-390` (`writeAndFail`) swallows an expected rejection in a comment-only `catch`.

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

- `packages/logixlysia/src/utils/error.ts`, `redact.ts`, `report.ts`, `sanitize.ts`
- `packages/logixlysia/src/output/file-sink.ts`, `file.ts`, `index.ts`, `keyed-mutex.ts`, `rotation-manager.ts`, `shutdown.ts`
- `packages/logixlysia/src/sampling/glob.ts`, `index.ts`
- `packages/logixlysia/__tests__/utils/**`, `packages/logixlysia/__tests__/output/**`, `packages/logixlysia/__tests__/sampling/**`
- `packages/logixlysia/__tests__/_helpers/perm-bits.ts` (create)
- `.changeset/utils-output-comments.md` (create)

**Out of scope** (do NOT touch):

- Existing files in `packages/logixlysia/__tests__/_helpers/` (plan 058 edits them).
- `packages/logixlysia/src/utils/settle.ts`, `report.ts`'s and `shutdown.ts`'s `// Swallow errors thrown by the hook itself.` catches: they mark intentional swallows that `no-empty` requires; every comment-free form fails another lint rule.
- `packages/logixlysia/src/utils/json.ts`: `stringifyForLog`'s doc is the contract other modules rely on (plan 059 depends on "always valid JSON or ''").
- The ReDoS and platform notes in `redact.ts` (JWT look-behind, scheme check, `[A-Z]` with `i`, DOMException accessors, URL serialisation), the keyed-mutex ordering notes, and the sampling `inFlight` note: they record behavior the code cannot show.

## Git workflow

- Branch: `improve/060-prune-utils-output-comments`, created in Step 0 from `b2a8244`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(logger): log the status the client actually got`).
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git switch -c improve/060-prune-utils-output-comments`. If that branch already exists, STOP.
2. `bun install --frozen-lockfile` → exit 0.
3. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
4. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`. If any fails before you changed anything, STOP.
5. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

A script deletes exact line ranges so none is mistyped. It refuses to write anything if a range does not start with the expected text or is not a whole comment.

1. `mkdir -p /tmp/prune-060`. Save Appendix A verbatim as `/tmp/prune-060/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-060/spec.txt`.
2. From the worktree root: `bun /tmp/prune-060/prune-comments.ts /tmp/prune-060/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `b2a8244`: STOP and report it.
3. `bun /tmp/prune-060/prune-comments.ts /tmp/prune-060/spec.txt` → `removed 191 comment lines across 21 files`.
4. `bun run format` → exit 0. It folds a now-empty multi-line body such as `() => {\n}` into `() => {}`.
5. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `703 pass`, `0 fail`.
6. `git checkout -- AGENTS.md`. `git status --short` lists only files that appear in Appendix B.
7. **Commit**: `chore(output): drop comments that restate the code`

**Verify**: `git show --stat HEAD` → 21 files. `git show HEAD | grep '^+' | grep -v '^+++'` prints only lines the formatter re-folded (no new words).

### Step 2: Correct the comments that stay

1. `packages/logixlysia/src/utils/sanitize.ts`: replace the `isControlCodePoint` doc with

```ts
/**
 * True for C0 controls other than tab and LF (0x00-0x08, 0x0B-0x1F), DEL
 * (0x7F), and C1 controls (0x80-0x9F).
 */
```

2. `packages/logixlysia/src/output/file-sink.ts`, in `interface FileSink`: replace

```ts
/** Resolves once every write issued so far is durably on disk. */
```

with

```ts
/** Resolves once every write issued so far has been written to the file. */
```

and

```ts
/** Resolves after `line` is durably written to disk. */
```

with

```ts
/** Resolves after `line` has been written to the file. */
```

Then replace the two-line comment in `maybeRotate`'s catch (quoted under "Current state") with `      // A rotation failure must not fail the caller's write.` 3. `packages/logixlysia/src/utils/redact.ts`: `/** pino redact paths for one key: top-level and one nesting level. */` → `/** pino redact paths for every default and extra key: top-level and one nesting level. */`

**Verify**: `grep -rn "durably" packages/logixlysia/src` → no output. `bun run lint` → exit 0.

**Commit**: `docs(output): correct the comments that stay`

### Step 3: Decode path segments through `decodeOrRaw`

In `packages/logixlysia/src/utils/redact.ts`, replace the start of `redactPathSegment` (quoted under "Current state") with a helper declared just above it:

```ts
const decodeOrRaw = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

const redactPathSegment = (segment: string): string => {
  const decoded = decodeOrRaw(segment)
  const redacted = redactString(decoded)
```

The rest of `redactPathSegment` is unchanged.

**Verify**: `cd packages/logixlysia && bun test __tests__/utils/redact.test.ts` → all pass. `bun run lint` → exit 0.

**Commit**: `refactor(redact): decode path segments through decodeOrRaw`

### Step 4: Check whether a test pins the transport lifecycle yield

1. In `packages/logixlysia/src/output/index.ts` (`runTransportLifecycle`), delete only the line `await Promise.resolve()`.
2. `cd packages/logixlysia && bun test` → record which tests fail.
3. `git checkout -- packages/logixlysia/src/output/index.ts`. `git status --short` → empty.
4. If step 2 had at least one failure: delete the comment line `// Yield first so the method is called from a microtask, never inline.` (keep the `await`), run the tests (→ pass), and **Commit**: `chore(output): let the tests guard the lifecycle yield`, naming the failing tests in the body.
5. If step 2 had no failure: change nothing, make no commit, and report "lifecycle yield not covered by a test; comment kept".

### Step 5: Let names carry what the test comments explained

1. Create `packages/logixlysia/__tests__/_helpers/perm-bits.ts`:

```ts
export const permBits = (mode: number): string => mode.toString(8).slice(-3)
```

Delete the local `permBits` in `__tests__/output/file.test.ts` and `__tests__/output/rotation-manager.test.ts`, and import it from `'../_helpers/perm-bits'` in both. 2. `__tests__/sampling/runtime.test.ts`: rename `sequence` to `rollsThenRepeatLast` and delete its doc line. Add, after the imports:

```ts
const ROLL_INSIDE_TEN_PERCENT = 0.05
const ROLL_OUTSIDE_TEN_PERCENT = 0.5
```

and replace

```ts
// 0.05 -> 5 < 10 (kept); 0.5 -> 50 >= 10 (dropped)
const sampling = resolveSampling({ head: { INFO: 10 } }, sequence([0.05, 0.5]))
```

with

```ts
const sampling = resolveSampling(
  { head: { INFO: 10 } },
  rollsThenRepeatLast([ROLL_INSIDE_TEN_PERCENT, ROLL_OUTSIDE_TEN_PERCENT])
)
```

3. `__tests__/output/interval-rotation.test.ts`: add `const restoreRealClock = (): void => { setSystemTime() }` after the constants at the top; in `afterEach` replace the comment and `setSystemTime()` with `restoreRealClock()`; in the test that resets mid-way, replace the three-line `// Reset to the real clock before the next write: ...` comment and the `setSystemTime()` under it with `restoreRealClock()`.
4. `__tests__/output/file.test.ts` (`writeAndFail`): replace the `try { await logToFile({...}) } catch { // Expected: ... }` with `await expect(logToFile({...})).rejects.toThrow()`, keeping the same `logToFile` argument object.
5. `bun run format`.

**Verify**: `bun run lint` → exit 0. Tests → `703 pass`, `0 fail`.

**Commit**: `test(output): share permBits and name the values comments explained`

### Step 6: Add the changeset

Create `.changeset/utils-output-comments.md`:

```md
---
'logixlysia': patch
---

Internal cleanup in the redaction, file output and sampling modules: comments that restated the code are gone, and the ones that stay now match it (the file sink never promised an fsync, and the control-character check never matched tab or LF). No behavior change.
```

**Commit**: `chore: add a changeset for the output cleanup`

### Step 7: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B b2a8244..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff b2a8244..HEAD | grep -c '^+.*oxlint-disable'` → `0`.

## Test plan

- No behavior change; the 703 tests stay green after every step. `redact.test.ts` (including the `%40` case at line 583), `file.test.ts`, `rotation-manager.test.ts`, `race-condition.test.ts` and the sampling tests pin what the deleted comments described.
- Step 4 is a mutation check before removing a "yield first" comment.
- Step 5 restructures tests only; the count stays 703.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`
- [ ] `git diff --name-only b2a8244..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)
- [ ] `grep -rn "durably" packages/logixlysia/src` → no output
- [ ] `grep -rn "const permBits" packages/logixlysia/__tests__` → one hit, in `_helpers/perm-bits.ts`

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `b2a8244`).
- A verification fails twice after a reasonable fix attempt.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.
- `rejects.toThrow()` fails because `logToFile` resolves in the `writeAndFail` scenario (the expectation in the original test is that it rejects).

## Maintenance notes

- The file sink resolves after the OS accepted the write, not after fsync. If durability is ever needed, add `handle.sync()` deliberately and document it then.
- Keep `stringifyForLog`'s doc accurate: plan 059 relies on it returning only valid JSON or `''`.

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
packages/logixlysia/src/utils/error.ts|37|37|/** Safe structured representation for data/tran
packages/logixlysia/src/utils/error.ts|39|39|/** Safe one-line message for the log line. */
packages/logixlysia/src/utils/report.ts|10|14|/**
packages/logixlysia/src/utils/sanitize.ts|12|12|/** Any value as plain text: strings as-is, obje
packages/logixlysia/src/utils/sanitize.ts|26|30|/**
packages/logixlysia/src/output/file-sink.ts|25|25|/** Reports a rotation-sink failure; falls back
packages/logixlysia/src/output/file-sink.ts|30|30|/** Flushes, then releases the file handle. Idem
packages/logixlysia/src/output/file-sink.ts|94|94|/** Runs `batch` once `prior` settles, whether i
packages/logixlysia/src/output/file-sink.ts|99|99|// A failed batch already rejected its own write
packages/logixlysia/src/output/file-sink.ts|137|138|// The directory only needs creating on first op
packages/logixlysia/src/output/file-sink.ts|147|147|/** True when either configured trigger (size, i
packages/logixlysia/src/output/file.ts|21|21|/** Duration/URL parts already computed by the c
packages/logixlysia/src/output/file.ts|27|27|/** Resolves the logged pathname (with query str
packages/logixlysia/src/output/file.ts|38|38|// Safely parse URL to avoid crashes on malforme
packages/logixlysia/src/output/file.ts|42|42|// Fallback to raw URL if parsing fails
packages/logixlysia/src/output/index.ts|48|48|/** Duration already computed by the caller; sam
packages/logixlysia/src/output/index.ts|84|87|/**
packages/logixlysia/src/output/index.ts|104|104|/** Waits for in-flight `log()` work and every t
packages/logixlysia/src/output/index.ts|112|112|/** Releases each transport's resources; only re
packages/logixlysia/src/output/keyed-mutex.ts|10|14|/**
packages/logixlysia/src/output/rotation-manager.ts|18|18|// Prevents concurrent compression of the same f
packages/logixlysia/src/output/rotation-manager.ts|21|21|/** Reports a sink failure; when omitted, the ca
packages/logixlysia/src/output/rotation-manager.ts|72|72|// Check if file still exists (might have been c
packages/logixlysia/src/output/rotation-manager.ts|76|76|// File doesn't exist, already compressed or del
packages/logixlysia/src/output/rotation-manager.ts|116|121|/**
packages/logixlysia/src/output/rotation-manager.ts|135|135|// Use Promise.allSettled to handle individual f
packages/logixlysia/src/output/rotation-manager.ts|140|140|// Extract successful stats, ignore files that w
packages/logixlysia/src/output/rotation-manager.ts|155|155|// Delete files individually, continuing even if
packages/logixlysia/src/output/rotation-manager.ts|160|160|// Log failures but don't crash
packages/logixlysia/src/output/rotation-manager.ts|202|204|// Interval-based triggering lives in `FileSinkI
packages/logixlysia/src/output/shutdown.ts|14|15|// The sinks report a failed flush themselves; h
packages/logixlysia/src/output/shutdown.ts|24|25|// Never hold the event loop open just to observ
packages/logixlysia/src/output/shutdown.ts|32|35|/**
packages/logixlysia/src/output/shutdown.ts|56|56|/** Drains every transport and every registered
packages/logixlysia/src/sampling/glob.ts|9|12|/**
packages/logixlysia/src/sampling/glob.ts|19|19|// If we have multiple ** with only short litera
packages/logixlysia/src/sampling/glob.ts|22|22|// Allow ** followed by reasonable literal paths
packages/logixlysia/src/sampling/glob.ts|34|42|/**
packages/logixlysia/src/sampling/glob.ts|44|44|// Detect repeated recursive wildcards that coul
packages/logixlysia/src/sampling/index.ts|76|76|/** Tail rules are OR-ed: any single match rescu
packages/logixlysia/src/sampling/index.ts|94|94|/** Keeps only the rates that actually drop some
packages/logixlysia/src/utils/redact.ts|14|14|/** Digit runs that may be formatted PANs (space
packages/logixlysia/src/utils/redact.ts|50|50|/** Case-insensitive key/header names whose VALU
packages/logixlysia/src/utils/redact.ts|80|80|/** Normalize `X_Api-Key` / `apiKey` style varia
packages/logixlysia/src/utils/redact.ts|87|87|/** Words that make a key sensitive wherever the
packages/logixlysia/src/utils/redact.ts|93|93|/** A key ending in this part names a credential
packages/logixlysia/src/utils/redact.ts|96|101|/**
packages/logixlysia/src/utils/redact.ts|134|134|/** Luhn checksum; `digits` must contain only `0
packages/logixlysia/src/utils/redact.ts|175|175|/** True when `text` has a URL scheme (a letter,
packages/logixlysia/src/utils/redact.ts|189|189|/** Returns `text` unchanged (same value) when n
packages/logixlysia/src/utils/redact.ts|223|223|/** Always returns a new instance; `params` is l
packages/logixlysia/src/utils/redact.ts|256|256|/** Apply PII redaction to a request URL while k
packages/logixlysia/src/utils/redact.ts|285|285|/** Headers whose value is an absolute URL and m
packages/logixlysia/src/utils/redact.ts|292|292|/** The URL's own serialisation, so a masked cop
packages/logixlysia/src/utils/redact.ts|301|301|/** One header value: whole when the name is sen
packages/logixlysia/src/utils/redact.ts|319|319|/** Always returns a new instance; `headers` is
packages/logixlysia/src/utils/redact.ts|353|353|/** A Proxy whose `get` trap throws cannot even
packages/logixlysia/src/utils/redact.ts|363|366|/**
packages/logixlysia/src/utils/redact.ts|368|373|/**
packages/logixlysia/src/utils/redact.ts|481|481|/** Same lazy-materialization strategy as {@link
packages/logixlysia/src/utils/redact.ts|501|502|// A getter or Proxy trap that throws: only this
packages/logixlysia/src/utils/redact.ts|539|539|/** What the sinks will serialize is the toJSON
packages/logixlysia/src/utils/redact.ts|577|579|// Dates carry no redactable string content and
packages/logixlysia/src/utils/redact.ts|628|628|// Bytes carry no keys to match; walking a buffe
packages/logixlysia/src/utils/redact.ts|654|661|/**
packages/logixlysia/__tests__/utils/redact.test.ts|145|145|// Original should not be mutated
packages/logixlysia/__tests__/utils/redact.test.ts|529|529|// Mirror Elysia consuming the body before loggi
packages/logixlysia/__tests__/utils/redact.test.ts|704|704|// Stringifying throws if the walker handed back
packages/logixlysia/__tests__/sampling/glob.test.ts|57|57|// The literal `/foo/` and `/bar` segments are s
packages/logixlysia/__tests__/output/transports.test.ts|137|137|// A second immediate failure must not log again
packages/logixlysia/__tests__/output/transports.test.ts|191|191|// Let promise microtasks run; rejections should
packages/logixlysia/__tests__/output/transports.test.ts|232|233|// A second immediate failure still invokes the
packages/logixlysia/__tests__/output/keyed-mutex.test.ts|15|16|// Hold the lock across a macrotask window: any
packages/logixlysia/__tests__/output/keyed-mutex.test.ts|33|34|// Both resolve immediately (before either relea
packages/logixlysia/__tests__/output/keyed-mutex.test.ts|48|49|// B registers itself as the map's "current" loc
packages/logixlysia/__tests__/output/keyed-mutex.test.ts|70|70|// Give any wrongly-unblocked C a window to (inc
packages/logixlysia/__tests__/output/race-condition.test.ts|28|28|// Create 50 concurrent write operations
packages/logixlysia/__tests__/output/race-condition.test.ts|40|40|// Wait for all writes to complete
packages/logixlysia/__tests__/output/race-condition.test.ts|43|43|// Read all log files (original + rotated)
packages/logixlysia/__tests__/output/race-condition.test.ts|59|59|// Extract message numbers from each line
packages/logixlysia/__tests__/output/race-condition.test.ts|68|68|// All 50 messages should be present (no data lo
packages/logixlysia/__tests__/output/race-condition.test.ts|72|72|// Verify all message IDs from 0-49 are present
packages/logixlysia/__tests__/output/race-condition.test.ts|92|92|// Create 20 writes that should all trigger rota
packages/logixlysia/__tests__/output/race-condition.test.ts|104|104|// This should not throw errors or lose data
packages/logixlysia/__tests__/output/race-condition.test.ts|107|107|// Count total log entries across all files
packages/logixlysia/__tests__/output/race-condition.test.ts|119|119|// All 20 entries should be preserved
packages/logixlysia/__tests__/output/race-condition.test.ts|139|140|// Fire all calls in the same tick (no awaits be
packages/logixlysia/__tests__/output/race-condition.test.ts|170|170|// Every line must be a single, complete, well-f
packages/logixlysia/__tests__/output/race-condition.test.ts|179|179|// No lines dropped or torn: exactly `total` dis
packages/logixlysia/__tests__/output/interval-rotation.test.ts|193|195|// Seed the file directly (no sink involved), so
packages/logixlysia/__tests__/output/interval-rotation.test.ts|228|231|// Documents the accepted idle-process tradeoff
packages/logixlysia/__tests__/output/rotation-manager.test.ts|13|13|/** Owner/group/other permission bits as a 3-dig
packages/logixlysia/__tests__/output/rotation-manager.test.ts|78|78|// Stagger mtimes: index 0 is oldest, index 3 is
packages/logixlysia/__tests__/output/rotation-manager.test.ts|87|88|// performRotation rotates the live file first,
packages/logixlysia/__tests__/output/rotation-manager.test.ts|95|95|// The two oldest pre-existing rotated files mus
packages/logixlysia/__tests__/output/rotation-manager.test.ts|98|98|// The newest pre-existing rotated file survives
packages/logixlysia/__tests__/output/file.test.ts|10|10|/** Owner/group/other permission bits as a 3-dig
packages/logixlysia/__tests__/output/file.test.ts|168|168|// No awaits between calls: all 50 land in the s
packages/logixlysia/__tests__/output/file.test.ts|180|181|// Every caller's own promise must resolve, prov
packages/logixlysia/__tests__/output/file.test.ts|220|221|// Small enough to stay under maxSize: proves th
packages/logixlysia/__tests__/output/file.test.ts|267|269|// Two small writes after the reset: if bytesWri
packages/logixlysia/__tests__/output/file.test.ts|346|347|// The hook throwing must not crash the caller;
packages/logixlysia/__tests__/output/transports.test.ts|12|12|/* noop */
packages/logixlysia/__tests__/output/transports.test.ts|17|17|/* noop */
packages/logixlysia/__tests__/output/transports.test.ts|64|64|/* noop */
packages/logixlysia/__tests__/output/transports.test.ts|88|88|/* noop */
packages/logixlysia/__tests__/sampling/plugin.test.ts|142|142|/* noop */
packages/logixlysia/__tests__/sampling/plugin.test.ts|145|145|/* noop */
packages/logixlysia/__tests__/sampling/plugin.test.ts|148|148|/* noop */
packages/logixlysia/src/utils/redact.ts|238|241|/**
```
