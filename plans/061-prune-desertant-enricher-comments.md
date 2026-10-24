# Plan 061: Prune the redaction and enricher comments and document what withRedaction skips

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b2a8244..HEAD -- packages/logixlysia/src/desertant.ts packages/logixlysia/src/enrichers.ts packages/logixlysia/__tests__/adapters/desertant.test.ts packages/logixlysia/__tests__/enrichers/plugin.test.ts` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `b2a8244`, 2026-10-23

## Why this matters

`src/desertant.ts` opens with a 32-line essay that attaches to no declaration, so it never reaches a user's editor, and it overstates the guarantee ("everything shipped to a transport is masked first"). The real gap is undocumented in the public `withRedaction` doc: only strings inside plain objects, arrays and errors are redacted; a `Date`, a `Map` or a class instance passes through untouched. That is the one comment this audit adds, because it is a public contract users need. The rest of the plan removes comments that restate the code and derives a magic `55` from the fields it counts.

## Current state

- Deletions: Appendix B lists 14 ranges (55 lines) in 4 files, including the module essay at `packages/logixlysia/src/desertant.ts:4-35`. `packages/logixlysia/apps/docs/content/integrations/desertant.mdx` already carries the same explanation for readers.
- `withRedaction`'s public doc (`packages/logixlysia/src/desertant.ts:317-328`) currently says:

```ts
/**
 * Wraps a transport so every record is passed through a PII model before it is
 * delivered. Redaction runs off the request path — {@link Transport.log}
 * returns immediately and the record is delivered once the model is done, in
 * the order it was logged.
 *
 * The wrapper fails closed by default: a record the model could not process is
 * dropped and reported through `onError`, never forwarded unredacted.
 *
 * @param transport The transport to protect. Its `flush`, if any, is preserved.
 * @param source The model, a promise for it, or a loader run on the first record.
 */
```

- The walker (`packages/logixlysia/src/desertant.ts:176-268`) redacts strings, recurses into arrays (`Array.isArray`), errors (`instanceof Error`) and plain objects (`isPlainObject`), stops at `maxDepth`, and returns anything else as is:

```ts
// Dates, Maps, class instances and the like: no safe generic way to rebuild
// them, so they pass through. Flatten anything that can carry free-text PII
// into plain fields before it reaches the transport.
return value
```

- `packages/logixlysia/src/enrichers.ts:20-25`:

```ts
const ZERO_TRACE_ID = '0'.repeat(32)
const ZERO_SPAN_ID = '0'.repeat(16)
const INVALID_VERSION = 'ff'
const CURRENT_VERSION = '00'
/** `00-` + 32 + `-` + 16 + `-` + 2: version 00 is exactly these four fields. */
const VERSION_00_LENGTH = 55
```

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

- `packages/logixlysia/src/desertant.ts`, `packages/logixlysia/src/enrichers.ts`
- `packages/logixlysia/__tests__/adapters/desertant.test.ts`
- `packages/logixlysia/__tests__/enrichers/plugin.test.ts` (only the single `/* noop */` line listed in Appendix B)
- `.changeset/desertant-docs.md` (create)

**Out of scope** (do NOT touch):

- `packages/logixlysia/__tests__/enrichers/plugin.test.ts` lines 205-240 (plan 056 rewrites a test there).
- `desertant.ts`'s `report` catch comment (lint-required), the error-rebuild rationale above `walker.error`, and `memoizeRedactor`'s doc: they carry reasons the code cannot show.
- The W3C Trace Context and user-agent ordering comments in `enrichers.ts`.

## Git workflow

- Branch: `improve/061-prune-desertant-enricher-comments`, created in Step 0 from `b2a8244`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(logger): log the status the client actually got`).
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git switch -c improve/061-prune-desertant-enricher-comments`. If that branch already exists, STOP.
2. `bun install --frozen-lockfile` → exit 0.
3. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
4. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`. If any fails before you changed anything, STOP.
5. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

A script deletes exact line ranges so none is mistyped. It refuses to write anything if a range does not start with the expected text or is not a whole comment.

1. `mkdir -p /tmp/prune-061`. Save Appendix A verbatim as `/tmp/prune-061/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-061/spec.txt`.
2. From the worktree root: `bun /tmp/prune-061/prune-comments.ts /tmp/prune-061/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `b2a8244`: STOP and report it.
3. `bun /tmp/prune-061/prune-comments.ts /tmp/prune-061/spec.txt` → `removed 55 comment lines across 4 files`.
4. `bun run format` → exit 0. It folds a now-empty multi-line body such as `() => {\n}` into `() => {}`.
5. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `703 pass`, `0 fail`.
6. `git checkout -- AGENTS.md`. `git status --short` lists only files that appear in Appendix B.
7. **Commit**: `chore(desertant): drop comments that restate the code`

**Verify**: `git show --stat HEAD` → 4 files. `git show HEAD | grep '^+' | grep -v '^+++'` prints only lines the formatter re-folded (no new words).

### Step 2: Say which values `withRedaction` delivers unredacted

1. In the `withRedaction` doc, insert this paragraph after the "fails closed" paragraph and before the `@param` lines:

```ts
 *
 * Strings inside plain objects, arrays and errors are redacted, down to
 * `maxDepth` levels of `meta`. Any other object, such as a `Date`, a `Map` or
 * a class instance, is delivered as it is, so flatten anything that can carry
 * free-text PII into plain fields first.
```

2. In the walker, shorten the inline comment to its first sentence:

```ts
// Dates, Maps, class instances and the like: no safe generic way to rebuild
// them, so they pass through.
```

**Verify**: `bun run build --filter logixlysia` → exit 0; `grep -c "Any other object, such as a" packages/logixlysia/dist/desertant.d.ts` → `1`. `bun run lint` → exit 0.

**Commit**: `docs(desertant): say which values withRedaction delivers unredacted`

### Step 3: Derive the version-00 traceparent length

In `packages/logixlysia/src/enrichers.ts`, replace

```ts
/** `00-` + 32 + `-` + 16 + `-` + 2: version 00 is exactly these four fields. */
const VERSION_00_LENGTH = 55
```

with

```ts
const VERSION_00_LENGTH =
  `${CURRENT_VERSION}-${ZERO_TRACE_ID}-${ZERO_SPAN_ID}-00`.length
```

It must stay below the declarations of `CURRENT_VERSION`, `ZERO_TRACE_ID` and `ZERO_SPAN_ID`.

**Verify**: `bun -e "console.log(\`00-\${'0'.repeat(32)}-\${'0'.repeat(16)}-00\`.length)"`→`55`. `cd packages/logixlysia && bun test **tests**/enrichers`→ all pass.`bun run lint` → exit 0.

**Commit**: `refactor(enrichers): derive the version-00 traceparent length`

### Step 4: Add the changeset

Create `.changeset/desertant-docs.md`:

```md
---
'logixlysia': patch
---

`withRedaction`'s documentation now says which values it leaves alone: only strings inside plain objects, arrays and errors are redacted, down to `maxDepth` levels, and any other object, such as a `Date`, a `Map` or a class instance, is delivered as it is. No behavior change.
```

**Commit**: `chore: add a changeset for the desertant docs`

### Step 5: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B b2a8244..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff b2a8244..HEAD | grep -c '^+.*oxlint-disable'` → `0`.

## Test plan

- No behavior change. `__tests__/adapters/desertant.test.ts` and `__tests__/enrichers/*` stay green; the traceparent tests cover the derived length.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`
- [ ] `git diff --name-only b2a8244..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)
- [ ] `grep -n "VERSION_00_LENGTH = 55" packages/logixlysia/src/enrichers.ts` → no output
- [ ] `grep -c "Any other object, such as a" packages/logixlysia/dist/desertant.d.ts` → `1` after `bun run build`

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `b2a8244`).
- A verification fails twice after a reasonable fix attempt.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.

## Maintenance notes

- If the walker learns to rebuild more types (for example `Map`), update the `withRedaction` doc in the same change.

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
packages/logixlysia/src/desertant.ts|4|35|/**
packages/logixlysia/src/desertant.ts|37|37|/** Number of nested levels of `meta` walked bef
packages/logixlysia/src/desertant.ts|39|39|/** Records allowed to wait for the model before
packages/logixlysia/src/desertant.ts|172|175|/**
packages/logixlysia/src/desertant.ts|277|281|/**
packages/logixlysia/src/desertant.ts|286|286|// Like `prior.then(task)`: a rejected `prior` s
packages/logixlysia/src/enrichers.ts|181|181|/** Header candidates per geo field, in priority
packages/logixlysia/src/enrichers.ts|201|201|/** ISO-3166-ish country/region codes: short alp
packages/logixlysia/src/enrichers.ts|237|237|/** A non-empty string field, bounded; any other
packages/logixlysia/src/enrichers.ts|243|243|/** A string that is a short country or region c
packages/logixlysia/src/enrichers.ts|297|297|/** Fields whose value must look like a short co
packages/logixlysia/__tests__/adapters/desertant.test.ts|23|23|/** Fails loudly instead of tripping over an opt
packages/logixlysia/__tests__/adapters/desertant.test.ts|34|37|/**
packages/logixlysia/__tests__/enrichers/plugin.test.ts|154|154|/* noop */
```
