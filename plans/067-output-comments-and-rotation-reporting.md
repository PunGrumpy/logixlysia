# Plan 067: Output: delete 33 comment lines, correct the birthtime doc, report a compression failure once, and free the transport-error test from test order

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7dea942..HEAD -- packages/logixlysia/src/output/file-sink.ts packages/logixlysia/src/output/rotation-manager.ts packages/logixlysia/__tests__/output/file.test.ts packages/logixlysia/__tests__/output/interval-rotation.test.ts packages/logixlysia/__tests__/output/keyed-mutex.test.ts packages/logixlysia/__tests__/output/race-condition.test.ts packages/logixlysia/__tests__/output/rotation-manager.test.ts packages/logixlysia/__tests__/output/transports.test.ts` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `7dea942`, 2026-10-24

## Why this matters

The output tests carry 30 lines of narration that their titles and assertions already state, plus one five-line warning that a test "must run before any other test that triggers a transport failure" because the error reporter's rate limit is module-scoped. A comment is a weak guard for test order; shifting the clock with Bun's `setSystemTime`, which three other test files already do, removes the dependence. In `rotation-manager.ts`, `compressFile` reports a failure and then rethrows it, so its only caller needs a comment-only `catch` to avoid reporting twice: one report in one place removes the catch and its three-line comment. The `resolveOpenedAt` doc claims the `now` fallback is "never wrong by more than the process lifetime"; the error is the file's age at open, which is unbounded.

## Current state

### Deletions (Appendix B, 15 ranges, 33 lines, 6 files)

- `src/output/file-sink.ts:102` restates `batch.lines.join('')`; `:117-120` narrates `await this.maybeRotate(options)` ("never rejects" is visible in `maybeRotate`'s own try/catch); `:180` narrates the catch that reports through `onRotationError`.
- `__tests__/output/file.test.ts:205`, `:250` restate that a 90-character line against `maxSize: 100` rotates, under titles that say so; `:324-326` is test-design narration whose `blocker` and `not-a-directory` names carry it.
- `__tests__/output/interval-rotation.test.ts:243-244` narrates `sleep(10)` and calls it "one macrotask", which it is not.
- `__tests__/output/keyed-mutex.test.ts:20-22`, `:49-50`, `:54-56` narrate the steps of `same-tick acquires for the same key are never held concurrently` and `release only clears the map entry when the caller is the current tail`.
- `__tests__/output/race-condition.test.ts:10-12` explains `EXCLUSION_LINE_REGEX`, which its name and anchors show; `:23`, `:81`, `:122` restate the `maxSize` option next to them.
- `__tests__/output/rotation-manager.test.ts:148-153` narrates why the `writeFile` spy exists under `retention cleanup still runs when compression fails`.

### The birthtime doc, `packages/logixlysia/src/output/file-sink.ts:10-15`

```ts
/**
 * The live file's creation time when the filesystem reports one;
 * some filesystems report 0/absent birthtime — fall back to `now`
 * (losing restart-survival for the interval clock, but never wrong
 * by more than the process lifetime).
 */
export const resolveOpenedAt = (
```

Line 138 sets `this.openedAt = resolveOpenedAt(stat.birthtimeMs, Date.now())` when the file opens. A file created days before a restart is treated as new at open.

### Compression reporting, `packages/logixlysia/src/output/rotation-manager.ts`

Lines 63-89 (`compressFile`):

```ts
export const compressFile = async (
  filePath: string,
  onError?: RotationErrorReporter,
  fileMode = DEFAULT_FILE_MODE
): Promise<void> => {
  const release = await compressionLock.acquire(filePath)
  try {
    try {
      await fs.access(filePath)
    } catch {
      return
    }

    const content = await fs.readFile(filePath)
    const compressed = await gzipAsync(content)
    await fs.writeFile(`${filePath}.gz`, compressed, { mode: fileMode })
    await fs.rm(filePath, { force: true })
  } catch (error) {
    reportRotationError(
      `[logixlysia] Failed to compress file ${filePath}:`,
      error,
      onError
    )
    throw error
  } finally {
    release()
  }
}
```

Lines 170-180 (inside `performRotation`), the only caller in `src/` or `__tests__/`:

```ts
if (algo === 'gzip') {
  try {
    await compressFile(rotated, onError, fileMode)
  } catch {
    // compressFile already reported this error via onError/console.error;
    // swallow the rethrow here so retention cleanup below still runs and
    // the failure isn't reported a second time by the caller's catch.
  }
}
```

`__tests__/output/rotation-manager.test.ts:130` `retention cleanup still runs when compression fails` exercises this path through `performRotation`; no test calls `compressFile` directly.

### The order-dependent test, `packages/logixlysia/__tests__/output/transports.test.ts`

Line 1: `import { describe, expect, mock, test } from 'bun:test'`.

Lines 98-107:

```ts
  // This test must run before any other test that triggers a transport
  // failure (e.g. the "never throws"/"swallows async rejections" tests
  // below): `reportTransportError`'s rate limit is module-scoped state that
  // persists across tests in this file, so it must observe the very first
  // failure to reliably assert both the log and the rate limit.
  test('reports a throwing transport to stderr, rate-limited', () => {
    const { spies, restore } = spyConsole(['error'])

    try {
```

and its end, lines 136-139:

```ts
      expect(spies.error).toHaveBeenCalledTimes(1)
    } finally {
      restore()
    }
```

The reporter, `packages/logixlysia/src/utils/report.ts`, keeps `let lastReportedAt = 0` per reporter and suppresses a report when `Date.now() - lastReportedAt < REPORT_INTERVAL_MS` with `REPORT_INTERVAL_MS = 5000`. `src/output/index.ts:11` creates one module-scoped `reportTransportError`. Precedent for shifting the clock: `__tests__/adapters/shared.test.ts:1` imports `setSystemTime` from `bun:test`, line 1046 calls `setSystemTime(new Date(Date.now() + 6000))`, and line 1058 resets with `setSystemTime()` in a `finally`.

### Repo facts

- Bun 1.3.14 workspaces with Turborepo. The published package is `packages/logixlysia`, an Elysia logging plugin.
- `origin/main` is `7dea942` ("Version Packages (#524)"). A local `main` may lag behind it; this plan is written against `7dea942` and the branch must start there.
- Lint and format are Ultracite (oxlint and oxfmt). `bun run lint` runs both and fails on any finding. Rules that shape this plan:
  - `no-empty` is an error: a block needs a statement or a comment. The comment-only `catch` in `src/output/shutdown.ts` stays. Step 3 removes a `try/catch` entirely rather than leaving an empty one.
  - `promise/prefer-await-to-then` is an error in `src/` and off under `__tests__/`.
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
| Tests | `cd packages/logixlysia && bun test` | `710 pass`, `0 fail` (at `7dea942` and when this plan is done) |
| Output tests | `cd packages/logixlysia && bun test __tests__/output` | all pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/output/file-sink.ts`
- `packages/logixlysia/src/output/rotation-manager.ts`
- `packages/logixlysia/__tests__/output/file.test.ts`
- `packages/logixlysia/__tests__/output/interval-rotation.test.ts`
- `packages/logixlysia/__tests__/output/keyed-mutex.test.ts`
- `packages/logixlysia/__tests__/output/race-condition.test.ts`
- `packages/logixlysia/__tests__/output/rotation-manager.test.ts`
- `packages/logixlysia/__tests__/output/transports.test.ts`
- `.changeset/rotation-compression-reported-once.md` (create)

**Out of scope** (do NOT touch):

- `src/output/index.ts`, `src/output/shutdown.ts`, `src/output/keyed-mutex.ts`, `src/output/file.ts`, `src/output/fs.ts` and `src/utils/report.ts`.
- `src/output/file-sink.ts:65-66` (`latestOptions`) and `:193-194` (the `flush()` yield): backlog items, their comments stay.
- `src/output/index.ts:90` (the `runTransportLifecycle` yield): a first-sweep mutation check found no test pinning it, so its comment stays.
- `__tests__/output/transports.test.ts` beyond the one test named in Step 4.

## Git workflow

- Branch: `improve/067-output-comments-and-rotation-reporting`, created in Step 0 from `7dea942`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log`.
- Commit with `git -c commit.gpgsign=false commit -m "<subject>"`.
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git rev-parse --short origin/main` → `7dea942`. If not, STOP.
2. `git switch -c improve/067-output-comments-and-rotation-reporting 7dea942`. If that branch already exists, STOP.
3. `bun install --frozen-lockfile` → exit 0.
4. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
5. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`. If any fails before you changed anything, STOP.
6. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

1. `mkdir -p /tmp/prune-067`. Save Appendix A verbatim as `/tmp/prune-067/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-067/spec.txt`.
2. From the worktree root: `bun /tmp/prune-067/prune-comments.ts /tmp/prune-067/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `7dea942`: STOP and report it.
3. `bun /tmp/prune-067/prune-comments.ts /tmp/prune-067/spec.txt` → `removed 33 comment lines across 6 files`.
4. `bun run format` → exit 0. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `710 pass`, `0 fail`.
5. `git checkout -- AGENTS.md`. `git status --short` lists only the six files in Appendix B.
6. **Commit**: `chore(output): drop comments the tests already state`

### Step 2: Say how late rotation can run without a birthtime

In `packages/logixlysia/src/output/file-sink.ts`, replace the `resolveOpenedAt` doc with

```ts
/**
 * The live file's creation time when the filesystem reports one. Some
 * filesystems report 0 or no birthtime; then `now` is used, so the interval
 * clock restarts at open and rotation can run late by the file's age.
 */
```

**Verify**: `bun run lint` → exit 0. `grep -c 'never wrong' packages/logixlysia/src/output/file-sink.ts` → `0`.

**Commit**: `docs(output): say how late rotation can run without a birthtime`

### Step 3: Report a compression failure once

In `packages/logixlysia/src/output/rotation-manager.ts`:

1. In `compressFile`'s `catch (error)` block, delete the line `    throw error`. The block keeps its `reportRotationError(...)` call, so it is not empty.
2. In `performRotation`, replace

```ts
if (algo === 'gzip') {
  try {
    await compressFile(rotated, onError, fileMode)
  } catch {
    // compressFile already reported this error via onError/console.error;
    // swallow the rethrow here so retention cleanup below still runs and
    // the failure isn't reported a second time by the caller's catch.
  }
}
```

with

```ts
if (algo === 'gzip') {
  await compressFile(rotated, onError, fileMode)
}
```

3. `bun run format`, `bun run lint`, `bun run typecheck` → exit 0. `cd packages/logixlysia && bun test __tests__/output` → all pass, including `retention cleanup still runs when compression fails`.

**Commit**: `refactor(output): report a compression failure once`

**Verify**: `grep -c 'compressFile already reported' packages/logixlysia/src/output/rotation-manager.ts` → `0`.

### Step 4: Free the transport-error test from test order

In `packages/logixlysia/__tests__/output/transports.test.ts`:

1. Change the first line to `import { describe, expect, mock, setSystemTime, test } from 'bun:test'`.
2. Delete the five-line comment above `test('reports a throwing transport to stderr, rate-limited', () => {` (the one that starts "This test must run before any other test").
3. Inside that test, directly after `const { spies, restore } = spyConsole(['error'])`, add the line

```ts
setSystemTime(new Date(Date.now() + 6000))
```

The reporter suppresses a report within 5000 ms of the previous one; a clock 6000 ms ahead puts this test's first failure outside any earlier test's window, whatever ran before.

4. Change the test's `finally` block from

```ts
    } finally {
      restore()
    }
```

to

```ts
    } finally {
      setSystemTime()
      restore()
    }
```

5. `bun run format` → exit 0. `bun run lint` → exit 0. `cd packages/logixlysia && bun test __tests__/output/transports.test.ts` → all pass. `bun test __tests__/output` → all pass. `bun test` → `710 pass`, `0 fail`.

**Commit**: `test(output): free the transport-error test from test order`

**Verify**: `grep -c 'This test must run before' packages/logixlysia/__tests__/output/transports.test.ts` → `0`; `grep -c 'setSystemTime' packages/logixlysia/__tests__/output/transports.test.ts` → `3`.

### Step 5: Add the changeset

Create `.changeset/rotation-compression-reported-once.md`:

```md
---
'logixlysia': patch
---

A failed log compression is reported once by the rotation manager, instead of being reported and then rethrown to a caller that swallowed it. No behavior change.
```

**Commit**: `chore: add a changeset for the rotation error reporting`

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

- No new tests. `__tests__/output/rotation-manager.test.ts` `retention cleanup still runs when compression fails` covers Step 3; `__tests__/output/transports.test.ts` `reports a throwing transport to stderr, rate-limited` is changed in Step 4 to control the clock and still asserts one report then one suppression.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`
- [ ] `grep -c 'throw error' packages/logixlysia/src/output/rotation-manager.ts` is one less than at `7dea942` (`git show 7dea942:packages/logixlysia/src/output/rotation-manager.ts | grep -c 'throw error'`)
- [ ] `grep -c 'compressFile already reported\|This test must run before' packages/logixlysia/src/output/rotation-manager.ts packages/logixlysia/__tests__/output/transports.test.ts` → both `0`
- [ ] `git diff --name-only 7dea942..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `7dea942`).
- A verification fails twice after a reasonable fix attempt.
- After Step 3, any test under `__tests__/output` expects `compressFile` or `performRotation` to reject.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.

## Maintenance notes

- `compressFile` now never rejects: it reports and returns. A future caller that needs to know the outcome should get a boolean return, not a rethrow.
- The transport-error test moves the clock forward by six seconds and restores it; a test added to the same file that asserts a transport-failure report must do the same.
- Deferred on purpose (recorded in `plans/README.md`'s refactor backlog): one configuration per `FileSinkImpl` instead of `latestOptions`, and a `flush()` that awaits the pending batch instead of yielding a tick.

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
packages/logixlysia/src/output/file-sink.ts|102|102|// Lines already carry their own trailing newlin
packages/logixlysia/src/output/file-sink.ts|117|120|// Rotation (if triggered) is awaited before res
packages/logixlysia/src/output/file-sink.ts|180|180|// A rotation failure must not fail the caller's
packages/logixlysia/__tests__/output/file.test.ts|205|205|// This single line already exceeds maxSize, so
packages/logixlysia/__tests__/output/file.test.ts|250|250|// Triggers rotation on its own.
packages/logixlysia/__tests__/output/file.test.ts|324|326|// A regular file where a directory is expected:
packages/logixlysia/__tests__/output/interval-rotation.test.ts|243|244|// No write happens here — just wait one macrota
packages/logixlysia/__tests__/output/keyed-mutex.test.ts|20|22|// Fire all three acquires in the same tick (no
packages/logixlysia/__tests__/output/keyed-mutex.test.ts|49|50|// A releases. Because B already overwrote the m
packages/logixlysia/__tests__/output/keyed-mutex.test.ts|54|56|// Queue C now. If A's release had incorrectly c
packages/logixlysia/__tests__/output/race-condition.test.ts|10|12|// A full-line regex: a torn line (cut mid-write
packages/logixlysia/__tests__/output/race-condition.test.ts|23|23|// Very small size to trigger rotation quickly
packages/logixlysia/__tests__/output/race-condition.test.ts|81|81|// Trigger rotation on every write
packages/logixlysia/__tests__/output/race-condition.test.ts|122|122|// Rotate on every write so the critical section
packages/logixlysia/__tests__/output/rotation-manager.test.ts|148|153|// The rotated file's exact name includes an unp
```
