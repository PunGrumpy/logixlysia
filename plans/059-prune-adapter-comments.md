# Plan 059: Prune the adapters' comments and replace their lint-only empty catches

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b2a8244..HEAD -- packages/logixlysia/src/adapters packages/logixlysia/src/axiom.ts packages/logixlysia/src/better-stack.ts packages/logixlysia/src/datadog.ts packages/logixlysia/src/otlp.ts packages/logixlysia/src/posthog.ts packages/logixlysia/src/sentry.ts packages/logixlysia/__tests__/adapters/helpers.ts packages/logixlysia/__tests__/adapters/shared.test.ts` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b2a8244`, 2026-10-23

## Why this matters

`src/adapters/shared.ts` backs all nine HTTP adapters, and most of its comments restate the next function or narrate design choices that its tests already pin (the batch queue alone has more than 30 tests by name: ordering, coalescing, drop reporting, flush semantics). Several comments only exist because a `catch {}` must not be empty, around code that has a cleaner form: `URL.canParse` instead of a try/catch around `new URL`, a small `readBodyText` helper, the existing `settle()` helper. Sentry even carries a duplicate URL parser with a false comment ("URL.canParse is missing on Node.js < 18.17, which this package still supports"; the package requires Node >= 22). Two public option docs (`flushIntervalMs`, `maxBatchSize`) and the OTLP `headers` doc promise behavior the code does not have.

## Current state

- Deletions: Appendix B lists 44 ranges (124 lines) in 9 files.
- `packages/logixlysia/src/adapters/shared.ts:161-167`:

```ts
const tryParseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value)
  } catch {
    // Reported by the caller, without the input: it may carry credentials.
  }
}
```

- `packages/logixlysia/src/sentry.ts:88-95` duplicates it:

```ts
// URL.canParse is missing on Node.js < 18.17, which this package still supports.
const tryParseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value)
  } catch {
    // Malformed URL: fall through to undefined so parseDsn reports the DSN.
  }
}
```

`sentry.ts` imports `createHttpTransport, defaultBody, envString, flattenMeta, getPath, transportError` from `'./adapters/shared'`. `packages/logixlysia/package.json` `engines.node` is `>=22`; `URL.canParse` exists since Node 19.9 and in Bun.

- `packages/logixlysia/src/adapters/shared.ts` `defaultBody` (`:751-772`) parses inline:

```ts
let path = url
try {
  path = new URL(url).pathname
} catch {
  // Keep the raw URL when it does not parse.
}
const body = `${method} ${path}`.trim()
```

- `attemptPost` (`:286-299`):

```ts
if (response.ok) {
  try {
    await response.body?.cancel()
  } catch {
    // Nothing to release when the body is already consumed or closed.
  }
  return
}
let body = ''
try {
  body = await response.text()
} catch {
  // An unreadable body only costs the error message its detail.
}
```

`settle` is already imported at the top of `shared.ts` (`import { settle } from '../utils/settle'`); it awaits a promise and swallows its rejection.

- `snapshotValue` (`:98-109`) has an unreachable catch, admitted by its comment:

```ts
try {
  return JSON.parse(json) as unknown
} catch {
  // stringifyForLog only ever returns valid JSON; this is belt and braces.
  return UNSERIALIZABLE_TEXT
}
```

Evidence: `stringifyForLog` (`packages/logixlysia/src/utils/json.ts`) returns `''`, the result of `JSON.stringify`, or the constant `UNSERIALIZABLE = '"[Unserializable]"'` (a JSON string). `UNSERIALIZABLE_TEXT` is also used by `flattenInto`, so the constant stays.

- `millisecondsInRange` (`:577-592`) relies on NaN comparisons and says so: `// Written so that NaN fails the range check.` then `const inRange = value >= min && value <= max`.
- `runSend` (`:438-447`) holds a load-bearing yield with a "Do not remove" comment:

```ts
    try {
      // Yield first. Without it a `send` that throws synchronously runs this
      // `finally` inside `startSend`, before `inFlight` is assigned there, and
      // that assignment then overwrites the tracker of the request started
      // below. Do not remove.
      await Promise.resolve()
      await input.send(entries)
```

The test `'a send that throws synchronously rejects its push and the queue keeps sending'` (`__tests__/adapters/shared.test.ts:923`) is meant to pin it. Step 2 proves that before the comment goes.

- Public docs that overpromise, in `BatchTransportOptions` (`shared.ts:35-44`): `flushIntervalMs` says `Max time (ms) an entry waits in the buffer before it is sent.` and `maxBatchSize` says `Entries buffered before an immediate flush, regardless of the interval.` In the code, `push` returns without sending while a request is in flight (`return inFlight ? undefined : flush()`), and `runSend`'s `finally` starts the next request once a full batch is waiting; a timer flush awaits the request in flight (`drainUntil`).
- `packages/logixlysia/src/otlp.ts:50-54` says headers are merged from both env vars:

```ts
/**
 * Extra request headers, e.g. vendor auth. Merged over headers parsed from
 * `OTEL_EXPORTER_OTLP_LOGS_HEADERS`, then `OTEL_EXPORTER_OTLP_HEADERS`
 * (`k=v,k2=v2`).
 */
```

The code (`otlp.ts:100-102`) uses one or the other: `envString('OTEL_EXPORTER_OTLP_LOGS_HEADERS') ?? envString('OTEL_EXPORTER_OTLP_HEADERS')`.

- `packages/logixlysia/src/sentry.ts:97`: `/** Names what's wrong with a DSN without echoing the DSN itself (it carries a secret key). */` The DSN carries Sentry's public key (`publicKey: url.username`), so "secret" is wrong, though not echoing it into logs is still right.

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

- `packages/logixlysia/src/adapters/shared.ts`, `packages/logixlysia/src/adapters/otlp-core.ts`
- `packages/logixlysia/src/axiom.ts`, `better-stack.ts`, `datadog.ts`, `otlp.ts`, `posthog.ts`, `sentry.ts`
- `packages/logixlysia/__tests__/adapters/helpers.ts`, `packages/logixlysia/__tests__/adapters/shared.test.ts`
- `.changeset/adapter-comments.md` (create)

**Out of scope** (do NOT touch):

- `packages/logixlysia/src/desertant.ts`, `packages/logixlysia/__tests__/adapters/desertant.test.ts` (plan 061).
- `packages/logixlysia/src/utils/**`, including `settle.ts` (plan 060).
- `createQueueReporter`'s `// Swallow errors thrown by the hook itself.` catch: a user hook must not throw out of the queue, and every comment-free form of that catch fails a lint rule. It stays.
- The platform-limit comments on `MAX_ABORT_TIMEOUT_MS`, `MAX_TIMER_DELAY_MS`, the `AbortSignal.timeout` note, the `__proto__` note in `snapshotMeta`, the nanosecond-string note on `toUnixNanos`, the `Date.parse` leniency note, and the Baggage note in `otlp.ts`: they record dependency or protocol behavior.

## Git workflow

- Branch: `improve/059-prune-adapter-comments`, created in Step 0 from `b2a8244`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(logger): log the status the client actually got`).
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git switch -c improve/059-prune-adapter-comments`. If that branch already exists, STOP.
2. `bun install --frozen-lockfile` → exit 0.
3. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
4. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`. If any fails before you changed anything, STOP.
5. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

A script deletes exact line ranges so none is mistyped. It refuses to write anything if a range does not start with the expected text or is not a whole comment.

1. `mkdir -p /tmp/prune-059`. Save Appendix A verbatim as `/tmp/prune-059/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-059/spec.txt`.
2. From the worktree root: `bun /tmp/prune-059/prune-comments.ts /tmp/prune-059/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `b2a8244`: STOP and report it.
3. `bun /tmp/prune-059/prune-comments.ts /tmp/prune-059/spec.txt` → `removed 124 comment lines across 9 files`.
4. `bun run format` → exit 0. It folds a now-empty multi-line body such as `() => {\n}` into `() => {}`.
5. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `703 pass`, `0 fail`.
6. `git checkout -- AGENTS.md`. `git status --short` lists only files that appear in Appendix B.
7. **Commit**: `chore(adapters): drop comments that restate the code`

**Verify**: `git show --stat HEAD` → 9 files. `git show HEAD | grep '^+' | grep -v '^+++'` prints only lines the formatter re-folded (no new words).

### Step 2: Prove the queue's first yield is pinned by a test, then drop its comment

1. In `packages/logixlysia/src/adapters/shared.ts` `runSend`, delete only the line `await Promise.resolve()` (leave the comment for now).
2. `cd packages/logixlysia && bun test __tests__/adapters/shared.test.ts` → record which tests fail.
3. Restore the file: `git checkout -- packages/logixlysia/src/adapters/shared.ts` (HEAD is the Step 1 commit). `git status --short` → empty.
4. If step 2 had at least one failure: delete the four comment lines above `await Promise.resolve()` (keep the `await`), run the test file again (→ all pass), and **Commit**: `chore(adapters): let the tests guard the queue's first yield`, with the failing test names from step 2 in the commit body.
5. If step 2 had no failure: change nothing, make no commit, and say "yield not covered by a test; comment kept" in your report.

### Step 3: Parse URLs through one helper

1. In `packages/logixlysia/src/adapters/shared.ts`, replace `tryParseUrl` (quoted under "Current state") with:

```ts
export const tryParseUrl = (value: string): URL | undefined =>
  URL.canParse(value) ? new URL(value) : undefined
```

2. In `defaultBody`, replace the six lines from `let path = url` through the closing `}` of the `catch` with:

```ts
const path = tryParseUrl(url)?.pathname ?? url
```

3. In `packages/logixlysia/src/sentry.ts`, delete the local `tryParseUrl` together with the comment line above it, and add `tryParseUrl` to the import list from `'./adapters/shared'`.
4. `bun run format`.

**Verify**: `grep -c "const tryParseUrl" packages/logixlysia/src/sentry.ts` → `0`. `cd packages/logixlysia && bun test __tests__/adapters` → all pass (includes `'does not echo credentials from an unparsable URL'` and the Sentry DSN tests). `bun run lint` → exit 0.

**Commit**: `refactor(adapters): parse URLs through one helper`

### Step 4: Read and release response bodies without empty catches

1. In `packages/logixlysia/src/adapters/shared.ts`, directly above `const attemptPost`, add:

```ts
const readBodyText = async (response: Response): Promise<string> => {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
```

2. In `attemptPost`, replace the block quoted under "Current state" (from `if (response.ok) {` through the second `catch`'s closing `}`) with:

```ts
if (response.ok) {
  if (response.body) {
    await settle(response.body.cancel())
  }
  return
}
const body = await readBodyText(response)
```

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters/shared.test.ts` → all pass (includes `'sanitizes escape sequences out of the response body preview'`). `bun run lint` → exit 0.

**Commit**: `refactor(adapters): read and release response bodies without empty catches`

### Step 5: Drop the unreachable catch in `snapshotValue`

Replace the `try { ... } catch { ... }` in `snapshotValue` with a plain `return JSON.parse(json) as unknown`, keeping the early `return` for `json === ''`:

```ts
const snapshotValue = (value: unknown): unknown => {
  const json = stringifyForLog(value)
  if (json === '') {
    return
  }
  return JSON.parse(json) as unknown
}
```

**Verify**: `grep -c "UNSERIALIZABLE_TEXT" packages/logixlysia/src/adapters/shared.ts` → at least `2` (declaration and `flattenInto`). Tests → `703 pass`. `bun run lint` → exit 0.

**Commit**: `refactor(adapters): drop an unreachable catch in snapshotValue`

### Step 6: Reject NaN explicitly

In `millisecondsInRange`, replace

```ts
// Written so that NaN fails the range check.
const inRange = value >= min && value <= max
```

with

```ts
const inRange = !Number.isNaN(value) && value >= min && value <= max
```

Then check that a test covers NaN: `grep -n "NaN" packages/logixlysia/__tests__/adapters/shared.test.ts`. If no NaN case exists in the test `'rejects a non-finite or out-of-range timeout or flushIntervalMs'`, add one expectation inside that test following its existing pattern, passing `Number.NaN` as `timeout`.

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters/shared.test.ts` → all pass.

**Commit**: `refactor(adapters): reject NaN explicitly in millisecondsInRange`

### Step 7: Make the public docs say what the code does

In `packages/logixlysia/src/adapters/shared.ts` (`BatchTransportOptions`):

```ts
/**
 * How long (ms) an entry waits in the buffer before it is sent. While a
 * request is still in flight, it goes out as soon as that request returns.
 * @default 2000
 */
```

replaces the `flushIntervalMs` doc, and

```ts
/**
 * Entries buffered before a send starts without waiting for the interval.
 * While a request is in flight, the batch goes out as soon as it returns.
 * @default 20
 */
```

replaces the `maxBatchSize` doc.

In `packages/logixlysia/src/otlp.ts`, the `headers` doc becomes:

```ts
/**
 * Extra request headers, e.g. vendor auth. Merged over the headers parsed
 * from `OTEL_EXPORTER_OTLP_LOGS_HEADERS`, or from
 * `OTEL_EXPORTER_OTLP_HEADERS` when that is unset (`k=v,k2=v2`).
 */
```

In `packages/logixlysia/src/sentry.ts`, the `describeDsnProblem` doc becomes:

```ts
/** Names what's wrong with a DSN without echoing it, since error messages reach logs and the DSN carries the project's key. */
```

**Verify**: `bun run lint` → exit 0.

**Commit**: `docs(adapters): describe batching, OTLP headers and DSN errors accurately`

### Step 8: Add the changeset

Create `.changeset/adapter-comments.md`:

```md
---
'logixlysia': patch
---

The adapter docs now say what `flushIntervalMs`, `maxBatchSize` and the OTLP adapter's `headers` actually do: a batch that is due while a request is in flight goes out as soon as that request returns, and the OTLP headers come from `OTEL_EXPORTER_OTLP_LOGS_HEADERS`, or from `OTEL_EXPORTER_OTLP_HEADERS` only when the first is unset. Internally, the adapters share one URL parser and no longer need comment-only `catch` blocks. No behavior change.
```

**Commit**: `chore: add a changeset for the adapter cleanup`

### Step 9: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B b2a8244..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff b2a8244..HEAD | grep -c '^+.*oxlint-disable'` → `0`.

## Test plan

- No behavior change; the 30+ batch queue tests and the per-adapter tests in `__tests__/adapters/` must stay green after every step.
- Step 2 is a mutation check: it proves a named test fails without the yield before its comment is removed.
- Step 6 adds at most one NaN expectation inside an existing test (count stays 703).

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`
- [ ] `git diff --name-only b2a8244..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)
- [ ] `grep -rn "const tryParseUrl" packages/logixlysia/src` → exactly one hit, in `adapters/shared.ts`
- [ ] `grep -n "belt and braces\|Written so that NaN" packages/logixlysia/src/adapters/shared.ts` → no output

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `b2a8244`).
- A verification fails twice after a reasonable fix attempt.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.
- Step 2 shows the yield is untested AND you are tempted to delete its comment anyway: don't. Keep it and report.
- `URL.canParse` is missing in the runtime used by the tests (a `TypeError` mentioning it).

## Maintenance notes

- `tryParseUrl` is the one URL parser for the adapters; new adapters should import it.
- The batch queue's behavior is now documented by its tests' names rather than prose. A change to queue semantics must update or add tests, not comments.

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
packages/logixlysia/src/adapters/otlp-core.ts|44|44|/** Adapter name used in error messages
packages/logixlysia/src/adapters/otlp-core.ts|49|49|/** Full OTLP logs URL
packages/logixlysia/src/adapters/otlp-core.ts|53|57|/**
packages/logixlysia/src/otlp.ts|20|24|/**
packages/logixlysia/src/otlp.ts|65|69|/**
packages/logixlysia/src/axiom.ts|76|76|// Meta first
packages/logixlysia/src/better-stack.ts|50|50|// Meta first
packages/logixlysia/src/datadog.ts|73|74|// Meta first
packages/logixlysia/src/posthog.ts|97|97|// Meta first
packages/logixlysia/src/adapters/shared.ts|6|6|/** OpenTelemetry severity numbers
packages/logixlysia/src/adapters/shared.ts|97|97|/** A plain copy of one meta value
packages/logixlysia/src/adapters/shared.ts|111|117|/**
packages/logixlysia/src/adapters/shared.ts|133|133|/** Normalizes a base URL
packages/logixlysia/src/adapters/shared.ts|142|142|/** Reads a non-empty environment
packages/logixlysia/src/adapters/shared.ts|148|148|/** A configuration error
packages/logixlysia/src/adapters/shared.ts|155|155|/** `scheme://user:pass@host`
packages/logixlysia/src/adapters/shared.ts|169|169|/** Parses a fully built endpoint
packages/logixlysia/src/adapters/shared.ts|203|203|/** Adapter name used in error messages
packages/logixlysia/src/adapters/shared.ts|210|214|/**
packages/logixlysia/src/adapters/shared.ts|233|237|/**
packages/logixlysia/src/adapters/shared.ts|315|319|/**
packages/logixlysia/src/adapters/shared.ts|328|333|/**
packages/logixlysia/src/adapters/shared.ts|360|373|/**
packages/logixlysia/src/adapters/shared.ts|377|377|/** The most entries one request carries
packages/logixlysia/src/adapters/shared.ts|386|386|/** The request in flight
packages/logixlysia/src/adapters/shared.ts|389|391|// Entries accepted by
packages/logixlysia/src/adapters/shared.ts|396|397|// Its own rate limit
packages/logixlysia/src/adapters/shared.ts|414|415|// Reset first
packages/logixlysia/src/adapters/shared.ts|424|424|// Rate limited on stderr
packages/logixlysia/src/adapters/shared.ts|429|434|/**
packages/logixlysia/src/adapters/shared.ts|454|457|// A full batch goes out at once
packages/logixlysia/src/adapters/shared.ts|461|462|// After the next request has started
packages/logixlysia/src/adapters/shared.ts|467|467|/** Starts a request for the caller
packages/logixlysia/src/adapters/shared.ts|474|476|// Recursion rather than a loop
packages/logixlysia/src/adapters/shared.ts|522|524|// Before the batch check
packages/logixlysia/src/adapters/shared.ts|538|538|/** Builds the request body
packages/logixlysia/src/adapters/shared.ts|541|541|/** Adapter name used in error messages
packages/logixlysia/src/adapters/shared.ts|547|550|/**
packages/logixlysia/src/adapters/shared.ts|719|723|/**
packages/logixlysia/src/adapters/shared.ts|732|732|/** Reads a dot-notation path
packages/logixlysia/src/adapters/shared.ts|747|750|/**
packages/logixlysia/__tests__/adapters/helpers.ts|20|24|/**
packages/logixlysia/__tests__/adapters/helpers.ts|67|67|/** Sets env vars for a test, returning a restor
packages/logixlysia/__tests__/adapters/shared.test.ts|24|24|/** A promise a test resolves by hand, to stand
```
