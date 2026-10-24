# Plan 065: Adapters: cap `timeout` at the delay a timer honours, correct the Datadog doc, name the default batch size in the Sentry test

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7dea942..HEAD -- packages/logixlysia/src/adapters/shared.ts packages/logixlysia/src/sentry.ts packages/logixlysia/src/datadog.ts packages/logixlysia/__tests__/adapters/shared.test.ts packages/logixlysia/__tests__/adapters/sentry.test.ts` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7dea942`, 2026-10-24

## Why this matters

Every HTTP adapter validates its `timeout` option against `MAX_ABORT_TIMEOUT_MS = 4_294_967_295`, documented as "the largest value `AbortSignal.timeout` accepts". That is true, and it is the wrong bound: on Node, `AbortSignal.timeout` is a timer, and Node clamps any delay above 2^31 - 1 ms to 1 ms with a `TimeoutOverflowWarning`. A `timeout` between 2^31 and 2^32 - 1 therefore passes validation and aborts every request after one millisecond on Node (Bun is unaffected; reproduced on Node v24.22.1 and Bun 1.3.14 on 2026-10-24). The file already has the right constant, `MAX_TIMER_DELAY_MS = 2_147_483_647`, used for `flushIntervalMs`. The fix is to use it for `timeout` too and delete the misleading constant.

Two smaller items ride along: the Datadog transport doc says "the full meta object rides along as searchable attributes" although five keys are reserved and a numeric `meta.status` is moved to `http.status_code`; and a Sentry test explains the number `20` in prose where the constant it comes from can be imported.

## Current state

### The timeout ceiling, `packages/logixlysia/src/adapters/shared.ts`

Lines 23-26:

```ts
/** The largest value `AbortSignal.timeout` accepts, 2^32 - 1. */
const MAX_ABORT_TIMEOUT_MS = 4_294_967_295
/** `setTimeout` runs a timer above 2^31 - 1 ms after 1 ms. */
const MAX_TIMER_DELAY_MS = 2_147_483_647
```

Lines 510-517:

```ts
// AbortSignal.timeout rejects fractions, and 0 would abort every request.
const timeout = millisecondsInRange(
  'timeout',
  input.options.timeout ?? DEFAULT_TIMEOUT_MS,
  1,
  MAX_ABORT_TIMEOUT_MS,
  { integer: true }
)
```

Line 249 passes it straight through: `signal: AbortSignal.timeout(input.timeout)`. `MAX_ABORT_TIMEOUT_MS` has no other use in `src/` or `__tests__/`. `millisecondsInRange` (lines 480-493) throws `transportError(input.name, \`${name} must be a whole number of milliseconds from ${min} to ${max}, got ${value}\`)` when out of range.

The validation test, `packages/logixlysia/__tests__/adapters/shared.test.ts:1205-1237`:

```ts
      const badValues: Record<string, number[]> = {
        flushIntervalMs: [-1, 2 ** 31, Number.NaN, Number.POSITIVE_INFINITY],
        timeout: [0, -5, 1.5, 2 ** 32, Number.NaN, Number.POSITIVE_INFINITY]
      }
      ...
      const validOptions = [
        { flushIntervalMs: 0, maxPendingBatches: 1, retries: 0, timeout: 1 },
        { flushIntervalMs: 2_147_483_647, timeout: 4_294_967_295 },
        { flushIntervalMs: 0.5 }
      ]
```

Reproduction (read-only, run anywhere): `node -e "AbortSignal.timeout(2147483648)"` prints `TimeoutOverflowWarning: 2147483648 does not fit into a 32-bit signed integer. Timeout duration was set to 1.`; `node -e "AbortSignal.timeout(2147483647)"` prints nothing.

### The Datadog doc, `packages/logixlysia/src/datadog.ts:47-53`

```ts
/**
 * Creates a transport that ships logs to Datadog via the v2 logs intake API.
 * The log level lands in the `status` attribute (Datadog's default status
 * remapper), and the full meta object rides along as searchable attributes.
 *
 * @throws {Error} When no API key is configured.
 */
```

`toEvent` (lines 72-90) spreads `...entry.meta` first and then sets `ddsource`, `message`, `service`, `status` and `timestamp`, overwriting any same-named meta key; when `entry.meta.status` is a number it is copied to `event.http = { status_code: entry.meta.status }` after `status` was overwritten with the level.

### The Sentry batch test, `packages/logixlysia/__tests__/adapters/sentry.test.ts`

Lines 1-3:

```ts
import { describe, expect, test } from 'bun:test'
import { createSentryTransport } from '../../src/sentry'
import { stubEnv, stubFetch } from './helpers'
```

Lines 177-181, inside `test.each([{}, { maxEntriesPerRequest: undefined }])('sends at most 100 logs per envelope with the options %p', ...)`:

```ts
// The 20th log fills the first batch; the 101 logged while it is in
// flight go out in envelopes of at most 100.
expect(stub.calls.map(call => parseEnvelope(call.body).items.length)).toEqual([
  20, 100, 1
])
```

The `20` is `DEFAULT_MAX_BATCH_SIZE` at `packages/logixlysia/src/adapters/shared.ts:14`, currently `const DEFAULT_MAX_BATCH_SIZE = 20` (not exported). `src/adapters/shared.ts` is an internal module, not a package entry (`package.json` `exports` lists `.`, `./ai`, `./axiom`, ... and no `./adapters/*`), so exporting a constant from it changes no public API.

### Deletions (Appendix B, 3 ranges, 5 lines, 2 files)

- `src/sentry.ts:89`: the doc on the non-exported `describeDsnProblem` restates its name; the "without echoing it" behaviour is pinned by `__tests__/adapters/sentry.test.ts:54` `throws on a DSN missing a project id without echoing the DSN`.
- `__tests__/adapters/shared.test.ts:650-651` narrates the `flush()` then `push` sequence the test's assertions pin.
- `__tests__/adapters/shared.test.ts:987-988` justifies an `if (failures === 1)` guard that `expect(failures).toBe(1)` already pins.

### Repo facts

- Bun 1.3.14 workspaces with Turborepo. The published package is `packages/logixlysia`, an Elysia logging plugin. The adapters (`src/axiom.ts`, `src/datadog.ts`, `src/sentry.ts`, ...) share `src/adapters/shared.ts`, which builds the batching HTTP transport with `fetch`.
- `origin/main` is `7dea942` ("Version Packages (#524)"). A local `main` may lag behind it; this plan is written against `7dea942` and the branch must start there.
- Lint and format are Ultracite (oxlint and oxfmt). `bun run lint` runs both and fails on any finding. Rules that shape this plan:
  - `no-empty` is an error: a block needs a statement or a comment. The comment-only `catch` in `createQueueReporter` (`shared.ts:302`) stays.
  - `no-magic-numbers` is not enabled, but the repo names every constant; keep that style.
  - Imports are sorted by oxfmt; run `bun run format` after adding one.
  - Never turn a rule off and never add an `oxlint-disable` comment. If lint rejects a change, restructure the code. If you cannot, STOP.
- `turbo` appends a block marked `<!-- BEGIN:turborepo-agent-rules -->` to `AGENTS.md` when it detects an AI agent. That change is not part of this plan: run `git checkout -- AGENTS.md` before every commit and never stage `AGENTS.md`.
- The repo signs commits through 1Password, which an agent session cannot reach. Commit with `git -c commit.gpgsign=false commit ...` and say so in your report.

## Commands you will need

| Purpose | Command (worktree root unless noted) | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | `710 pass`, `0 fail` (at `7dea942` and when this plan is done; the suite count does not change) |
| Adapter tests | `cd packages/logixlysia && bun test __tests__/adapters` | all pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/adapters/shared.ts`
- `packages/logixlysia/src/sentry.ts`
- `packages/logixlysia/src/datadog.ts`
- `packages/logixlysia/__tests__/adapters/shared.test.ts`
- `packages/logixlysia/__tests__/adapters/sentry.test.ts`
- `.changeset/adapter-timeout-ceiling.md` (create)

**Out of scope** (do NOT touch):

- The other adapter entry files (`axiom.ts`, `better-stack.ts`, `clickhouse.ts`, `hyperdx.ts`, `loki.ts`, `otlp.ts`, `posthog.ts`) and `src/adapters/otlp-core.ts`.
- `shared.ts:25-26` (`MAX_TIMER_DELAY_MS` and its doc) and `shared.ts:510` (the fractions comment): both are platform facts that stay.
- The public `timeout` option doc (`shared.ts:74-78`): it states the default only, which is still true.
- `apps/docs/content/**`.

## Git workflow

- Branch: `improve/065-adapter-timeout-ceiling-and-docs`, created in Step 0 from `7dea942`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(enrichers): keep set-cookie from both the Response and set.headers`).
- Commit with `git -c commit.gpgsign=false commit -m "<subject>"`.
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git rev-parse --short origin/main` → `7dea942`. If not, STOP.
2. `git switch -c improve/065-adapter-timeout-ceiling-and-docs 7dea942`. If that branch already exists, STOP.
3. `bun install --frozen-lockfile` → exit 0.
4. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
5. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`. If any fails before you changed anything, STOP.
6. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

1. `mkdir -p /tmp/prune-065`. Save Appendix A verbatim as `/tmp/prune-065/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-065/spec.txt`.
2. From the worktree root: `bun /tmp/prune-065/prune-comments.ts /tmp/prune-065/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `7dea942`: STOP and report it.
3. `bun /tmp/prune-065/prune-comments.ts /tmp/prune-065/spec.txt` → `removed 5 comment lines across 2 files`.
4. `bun run format` → exit 0. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `710 pass`, `0 fail`.
5. `git checkout -- AGENTS.md`. `git status --short` lists only the two files in Appendix B.
6. **Commit**: `chore(adapters): drop comments the tests already state`

### Step 2: Cap `timeout` at the delay a timer honours

1. In `packages/logixlysia/src/adapters/shared.ts`, delete these two lines:

```ts
/** The largest value `AbortSignal.timeout` accepts, 2^32 - 1. */
const MAX_ABORT_TIMEOUT_MS = 4_294_967_295
```

2. In the same file, in the `timeout` validation, replace `MAX_ABORT_TIMEOUT_MS,` with `MAX_TIMER_DELAY_MS,` so it reads:

```ts
const timeout = millisecondsInRange(
  'timeout',
  input.options.timeout ?? DEFAULT_TIMEOUT_MS,
  1,
  MAX_TIMER_DELAY_MS,
  { integer: true }
)
```

3. In `packages/logixlysia/__tests__/adapters/shared.test.ts`, change the `badValues` entry for `timeout` to add the first value Node clamps:

```ts
timeout: [0, -5, 1.5, 2 ** 31, 2 ** 32, Number.NaN, Number.POSITIVE_INFINITY]
```

and change the `validOptions` entry `{ flushIntervalMs: 2_147_483_647, timeout: 4_294_967_295 },` to:

```ts
        { flushIntervalMs: 2_147_483_647, timeout: 2_147_483_647 },
```

4. `bun run format` → exit 0 (it may re-wrap the `timeout:` array). `bun run lint` → exit 0. `bun run typecheck` → exit 0.
5. `cd packages/logixlysia && bun test __tests__/adapters` → all pass. `bun test` → `710 pass`, `0 fail`.
6. `git checkout -- AGENTS.md`. `git status --short` → `shared.ts` and `shared.test.ts` only.

**Commit**: `fix(adapters): cap timeout at the largest delay a timer honours`

**Verify**: `grep -rc 'MAX_ABORT_TIMEOUT_MS' packages/logixlysia/src packages/logixlysia/__tests__ | grep -v ':0$'` → no output. `grep -c '2_147_483_647' packages/logixlysia/__tests__/adapters/shared.test.ts` → `2`.

### Step 3: Name the attributes the Datadog event reserves

In `packages/logixlysia/src/datadog.ts`, replace the two doc lines

```ts
 * The log level lands in the `status` attribute (Datadog's default status
 * remapper), and the full meta object rides along as searchable attributes.
```

with

```ts
 * The log level lands in the `status` attribute (Datadog's default status
 * remapper). Meta fields ride along as searchable attributes, except that
 * `ddsource`, `message`, `service`, `status` and `timestamp` are reserved,
 * and a numeric `meta.status` is moved to `http.status_code`.
```

**Verify**: `bun run lint` → exit 0. `bun run build --filter logixlysia` → exit 0; `grep -c 'moved to \`http.status_code\`' packages/logixlysia/dist/datadog.d.ts`→`1`.

**Commit**: `docs(datadog): name the attributes the event reserves`

### Step 4: Name the default batch size in the Sentry test

1. In `packages/logixlysia/src/adapters/shared.ts`, change `const DEFAULT_MAX_BATCH_SIZE = 20` to `export const DEFAULT_MAX_BATCH_SIZE = 20`.
2. In `packages/logixlysia/__tests__/adapters/sentry.test.ts`, add the import `import { DEFAULT_MAX_BATCH_SIZE } from '../../src/adapters/shared'` next to the other `../../src` import (oxfmt sorts it on format), then replace

```ts
// The 20th log fills the first batch; the 101 logged while it is in
// flight go out in envelopes of at most 100.
expect(stub.calls.map(call => parseEnvelope(call.body).items.length)).toEqual([
  20, 100, 1
])
```

with

```ts
expect(stub.calls.map(call => parseEnvelope(call.body).items.length)).toEqual([
  DEFAULT_MAX_BATCH_SIZE,
  100,
  1
])
```

The `100` is the Sentry default the test's own title names ("sends at most 100 logs per envelope").

3. `bun run format` → exit 0. `bun run lint` → exit 0. `bun run typecheck` → exit 0. `cd packages/logixlysia && bun test __tests__/adapters/sentry.test.ts` → all pass. The API snapshot test (`__tests__/api/surface.test.ts`) must still pass with no snapshot update: `bun test __tests__/api` → pass.

**Commit**: `test(sentry): name the default batch size instead of explaining 20`

### Step 5: Add the changeset

Create `.changeset/adapter-timeout-ceiling.md`:

```md
---
'logixlysia': patch
---

Adapter `timeout` values above 2,147,483,647 ms (2^31 - 1) are now rejected at construction. Node clamps a longer timer to 1 ms, so such a timeout aborted every request on Node; Bun was unaffected. The Datadog transport doc now names the attributes the event reserves (`ddsource`, `message`, `service`, `status`, `timestamp`) and says that a numeric `meta.status` moves to `http.status_code`.
```

**Commit**: `chore: add a changeset for the adapter timeout ceiling`

### Step 6: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B 7dea942..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff 7dea942..HEAD | grep -c '^+.*oxlint-disable'` → `0`.
8. `git diff --name-only 7dea942..HEAD` lists only files from the Scope section.

## Test plan

- Step 2 extends the existing validation test: `2 ** 31` now throws for `timeout` (it already did for `flushIntervalMs`), and `2_147_483_647` is the accepted maximum. No new test file.
- Step 4 changes an assertion's spelling, not its value.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`
- [ ] `grep -rn 'MAX_ABORT_TIMEOUT_MS' packages/logixlysia/src packages/logixlysia/__tests__` → no output
- [ ] `grep -c 'export const DEFAULT_MAX_BATCH_SIZE' packages/logixlysia/src/adapters/shared.ts` → `1`
- [ ] `__tests__/api/__snapshots__/surface.test.ts.snap` is unchanged (`git diff --name-only 7dea942..HEAD | grep -c snap` → `0`)
- [ ] `git diff --name-only 7dea942..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `7dea942`).
- A verification fails twice after a reasonable fix attempt.
- The API snapshot test fails after Step 4 (it means `src/adapters/shared.ts` has become a public entry; do not update the snapshot).
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.

## Maintenance notes

- `MAX_TIMER_DELAY_MS` is now the single ceiling for every millisecond option that ends in a timer or an `AbortSignal.timeout`. A new timed option should reuse it.
- A reviewer should check that the error message a user sees for an oversized `timeout` now reads `... from 1 to 2147483647, got ...`.
- Deferred on purpose: nothing from this slice. The adapter option docs were checked claim by claim against the request-building code and hold.

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
packages/logixlysia/src/sentry.ts|89|89|/** Names what's wrong with a DSN without echoin
packages/logixlysia/__tests__/adapters/shared.test.ts|650|651|// Clears the timer, as the timer firing would,
packages/logixlysia/__tests__/adapters/shared.test.ts|987|988|// Logs only the first failure, so that a queue
```
