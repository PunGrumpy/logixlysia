# Plan 068: Desertant and enrichers, second pass: delete 10 comment lines and move the loader's no-retry rule into the public doc

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7dea942..HEAD -- packages/logixlysia/src/desertant.ts packages/logixlysia/src/enrichers.ts` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `7dea942`, 2026-10-24

## Why this matters

After PR #519 the `withRedaction` public doc says which values pass through unredacted, so the inline comment in the walker that says the same is a duplicate. The `walker.error` doc narrates code whose `clone` variable and `Object.create` copy already show what it does. A two-line comment in `enrichers.ts` restates four named constants. The one comment with a real reason, "a rejected load stays rejected: retrying on every record would hammer the model host", sits on an unexported helper named `memoizeRedactor`, where no user sees it and where `cached ??=` on a rejected promise reads like a missing retry. The rule is a contract of the public `NeuralRedactorSource` type, so it moves into that doc, and the helper's name says what it does.

## Current state

### Deletions (Appendix B, 3 ranges, 10 lines, 2 files)

- `src/desertant.ts:152-157`: the `walker.error` doc. The `clone` built with `Object.create(Object.getPrototypeOf(original))` and the `redactText` calls on `message` and `stack` show the rebuild. This reverses a keep from PR #519's plan, on a second read under the same rule: it is our own policy, not a dependency's behaviour.
- `src/desertant.ts:209-210`: duplicates the `withRedaction` doc (lines 280-283, "Any other object, such as a `Date`, a `Map` or a class instance, is delivered as it is").
- `src/enrichers.ts:70-71`: "`ff` is reserved, all-zero ids are invalid, and a version-00 header carrying extra fields is malformed" restates `INVALID_VERSION`, `ZERO_TRACE_ID`, `ZERO_SPAN_ID`, `CURRENT_VERSION` and `VERSION_00_LENGTH` in the condition under it; the regex comment at line 17 already says that only versions above 00 may carry a tail.

### The loader, `packages/logixlysia/src/desertant.ts`

Lines 33-40:

```ts
/**
 * A redactor, a promise for one, or a loader called once on the first record —
 * `Redact.load` can be passed directly, keeping model download off the boot path.
 */
export type NeuralRedactorSource =
  | (() => NeuralRedactor | Promise<NeuralRedactor>)
  | NeuralRedactor
  | Promise<NeuralRedactor>
```

Lines 96-109:

```ts
/**
 * Resolves the source once. A rejected load stays rejected: retrying on every
 * record would hammer the model host, and the failure is reported per record
 * through `onError` either way.
 */
const memoizeRedactor = (
  source: NeuralRedactorSource
): (() => Promise<NeuralRedactor>) => {
  let cached: Promise<NeuralRedactor> | undefined
  return () => {
    cached ??= resolveRedactor(source)
    return cached
  }
}
```

Line 303: `const getRedactor = memoizeRedactor(source)`. These are the only two occurrences of `memoizeRedactor` in the repository.

Tests that pin the behaviour, in `packages/logixlysia/__tests__/adapters/desertant.test.ts`: line 296 `loads the model once, lazily, from a loader function`, and line 319 passes `() => Promise.reject(new Error('download failed'))` as the source.

### Repo facts

- Bun 1.3.14 workspaces with Turborepo. The published package is `packages/logixlysia`, an Elysia logging plugin. `logixlysia/desertant` and `logixlysia/enrichers` are package entries, so their `/** */` docs reach users' editors through `dist/*.d.ts`.
- `origin/main` is `7dea942` ("Version Packages (#524)"). A local `main` may lag behind it; this plan is written against `7dea942` and the branch must start there.
- Lint and format are Ultracite (oxlint and oxfmt). `bun run lint` runs both and fails on any finding. `no-empty` is an error, so the comment-only `catch` in `desertant.ts`'s `report` stays. Never turn a rule off and never add an `oxlint-disable` comment.
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
| Build | `bun run build` | exit 0 |

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/desertant.ts`
- `packages/logixlysia/src/enrichers.ts`
- `.changeset/desertant-loader-docs.md` (create)

**Out of scope** (do NOT touch):

- `desertant.ts`'s `report` catch comment (lint-required), the `walker` object's shape, and every option doc.
- `enrichers.ts:17` (the traceparent regex comment), `:85` (the sampled-flag bit), `:106` (browser token ordering) and `:214` (Vercel's encoded city header): protocol and vendor facts that stay.
- Every test file.

## Git workflow

- Branch: `improve/068-prune-desertant-enricher-second-pass`, created in Step 0 from `7dea942`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log`.
- Commit with `git -c commit.gpgsign=false commit -m "<subject>"`.
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git rev-parse --short origin/main` → `7dea942`. If not, STOP.
2. `git switch -c improve/068-prune-desertant-enricher-second-pass 7dea942`. If that branch already exists, STOP.
3. `bun install --frozen-lockfile` → exit 0.
4. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
5. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`. If any fails before you changed anything, STOP.
6. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

1. `mkdir -p /tmp/prune-068`. Save Appendix A verbatim as `/tmp/prune-068/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-068/spec.txt`.
2. From the worktree root: `bun /tmp/prune-068/prune-comments.ts /tmp/prune-068/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `7dea942`: STOP and report it.
3. `bun /tmp/prune-068/prune-comments.ts /tmp/prune-068/spec.txt` → `removed 10 comment lines across 2 files`.
4. `bun run format` → exit 0. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `710 pass`, `0 fail`.
5. `git checkout -- AGENTS.md`. `git status --short` lists only the two files in Appendix B.
6. **Commit**: `chore(desertant): drop comments the code and public docs already carry`

### Step 2: Move the no-retry rule into the public doc and name the helper

All edits are in `packages/logixlysia/src/desertant.ts`.

1. Replace the `NeuralRedactorSource` doc

```ts
/**
 * A redactor, a promise for one, or a loader called once on the first record —
 * `Redact.load` can be passed directly, keeping model download off the boot path.
 */
```

with

```ts
/**
 * A redactor, a promise for one, or a loader called once on the first record —
 * `Redact.load` can be passed directly, keeping model download off the boot path.
 * A loader that fails is not retried: every later record is then handled as a
 * redaction failure.
 */
```

2. Delete the doc above `memoizeRedactor` (the `/** ... */` block that starts "Resolves the source once.") and rename the helper: `const memoizeRedactor = (` becomes `const loadRedactorOnce = (`, and `const getRedactor = memoizeRedactor(source)` becomes `const getRedactor = loadRedactorOnce(source)`. The body does not change.

3. `bun run format` → exit 0. `bun run lint` → exit 0. `bun run typecheck` → exit 0.
4. `cd packages/logixlysia && bun test __tests__/adapters/desertant.test.ts` → all pass (the `loads the model once` and `download failed` tests cover both halves of the rule).
5. `bun run build --filter logixlysia` → exit 0; `grep -c 'A loader that fails is not retried' packages/logixlysia/dist/desertant.d.ts` → `1`.

**Commit**: `refactor(desertant): say in the public doc that a failed loader is not retried`

**Verify**: `grep -c 'memoizeRedactor' packages/logixlysia/src/desertant.ts` → `0`; `grep -c 'loadRedactorOnce' packages/logixlysia/src/desertant.ts` → `2`.

### Step 3: Add the changeset

Create `.changeset/desertant-loader-docs.md`:

```md
---
'logixlysia': patch
---

`NeuralRedactorSource`'s documentation now says that a loader which fails is not retried, and that every later record is then handled as a redaction failure. No behavior change.
```

**Commit**: `chore: add a changeset for the desertant loader docs`

### Step 4: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B 7dea942..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff 7dea942..HEAD | grep -c '^+.*oxlint-disable'` → `0`.
8. `git diff --name-only 7dea942..HEAD` lists only files from the Scope section.

## Test plan

- No new tests. `__tests__/adapters/desertant.test.ts` (`loads the model once, lazily, from a loader function`; the `download failed` rejection case) and `__tests__/enrichers/*` stay green.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`
- [ ] `grep -c 'memoizeRedactor' packages/logixlysia/src/desertant.ts` → `0`
- [ ] `grep -c 'A loader that fails is not retried' packages/logixlysia/dist/desertant.d.ts` → `1` after `bun run build`
- [ ] `git diff --name-only 7dea942..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `7dea942`).
- A verification fails twice after a reasonable fix attempt.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.

## Maintenance notes

- If the loader ever gains a retry, update the `NeuralRedactorSource` doc in the same change; the tests at `desertant.test.ts:296` and `:319` will also need revisiting.
- Deferred on purpose: collapsing the `walker` object (its shape is what `no-use-before-define` and `func-style` allow for mutual recursion).

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
packages/logixlysia/src/desertant.ts|152|157|/**
packages/logixlysia/src/desertant.ts|209|210|// Dates, Maps, class instances and the like: no sa
packages/logixlysia/src/enrichers.ts|70|71|// `ff` is reserved, all-zero ids are invalid, and
```
