# Plan 064: Plugin core, second pass: delete 31 comment lines, derive the format-token regex from one list, name two conditions, correct three docs

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7dea942..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/src/errors.ts packages/logixlysia/src/context/request-context.ts packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/src/logger/handle-http-error.ts packages/logixlysia/src/logger/index.ts packages/logixlysia/__tests__/plugin/concurrent-timing.test.ts packages/logixlysia/__tests__/types/typed-fields.test.ts packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `7dea942`, 2026-10-24

## Why this matters

The first comment sweep (PR #516) left the plugin core with comments that a second read shows to be duplicates, narration of a perf choice, or bug history that a test already pins. One of them is a maintenance warning in prose ("adding a new format token requires adding it both to `LOG_FORMAT_REGEX` and to the token-gating checks"): that constraint belongs in the type system, where forgetting it fails `tsc` instead of silently producing an unreplaced `{token}` in every log line. Two comments explain a boolean condition that a named constant can carry. Three comments are false against the code or against pino-pretty's source: one claims the response-header merge runs "only when an enricher will actually read it" while it runs for request-only enrichers too, one claims the request-id header is written "now, not when the line is written" while `closeRequest` writes it again at line time, and one misquotes pino-pretty's `standard` timestamp pattern.

## Current state

### Deletions (Appendix B, 10 ranges, 31 lines, 8 files)

Each range was read against the code at `7dea942`:

- `src/index.ts:245` repeats the `LogixlysiaSingleton` doc four lines above it ("Explicit singleton without Elysia's `SingletonBase` `Record<string, unknown>` ... keep precise keys").
- `src/index.ts:459-463` (the `exitRequestScope` doc) is pinned by `__tests__/plugin/lifecycle.test.ts:150` `useLogger() outside a finished request is a no-op`.
- `src/errors.ts:71` points at the class doc, which already explains `internal`.
- `src/context/request-context.ts:1` restates `Request | object`; the `keyOf` doc below it explains the WebSocket half.
- `src/logger/handle-http-error.ts:38-40` restates the `level` ternary and duplicates the `finishRequest` doc in `src/index.ts` (which stays; it is the rule's home).
- `src/logger/index.ts:61-65` narrates why pino is built lazily; `getPino`, `lazyPino` and the Elysia `state()` comment below carry it.
- The four test ranges are bug history ("Pre-fix, ..."), a restatement of what `@ts-expect-error` means, and two docs on non-exported test helpers that restate their bodies.

### Format tokens, `packages/logixlysia/src/logger/create-logger.ts`

Lines 20-21:

```ts
const LOG_FORMAT_REGEX =
  /\{(?:now|epoch|level|icon|duration|method|pathname|path|query|status|statusText|message|ip|context|service|speed|requestId)\}/gu
```

Lines 288-296:

```ts
/**
 * Resolves colors/format/thresholds/service once per logger instance instead of per log line.
 * Safe to hoist: TTY-ness and config don't change across a process's lifetime, so freezing the
 * colors decision at construction time matches real process lifecycles.
 *
 * NOTE: adding a new format token requires adding it both to {@link LOG_FORMAT_REGEX} and to the
 * token-gating checks in {@link formatLogOutput} below.
 */
export const createFormatContext = (options: Options): FormatContext => {
```

Lines 680-704 (inside `formatLogOutput`):

```ts
const tokenMap: Record<string, string> = {
  '{context}': ctxString,
  '{duration}': coloredDuration,
  '{epoch}': epoch,
  '{icon}': icon,
  '{ip}': ip,
  '{level}': coloredLevel,
  '{message}': message,
  '{method}': coloredMethod,
  '{now}': timestamp,
  '{pathname}': coloredPathname,
  '{path}': coloredPathname,
  '{query}': query,
  '{requestId}': requestId,
  '{service}': serviceToken,
  '{speed}': speedToken,
  '{statusText}': statusText,
  '{status}': coloredStatus
}

const main = format.replace(LOG_FORMAT_REGEX, match => tokenMap[match] ?? match)
```

The 17 names in the regex and the 17 keys of `tokenMap` are the same set. `FormatContext.tokens` (line 283) is `Set<string>` and the gating checks are string literals such as `tokens.has('{icon}')`; they do not change.

### Two conditions explained by comments, `packages/logixlysia/src/index.ts`

Lines 503-507 (inside `finishRequest`):

```ts
    const owner = lineOwners.get(request)
    if (record.seenByWrap && owner !== undefined && owner !== instance) {
      // Another instance's route hooks wrote this request's line. Still
      // resolve this instance's tail sampling, or what it buffered for the
      // request (a `useLogger()` call, say) is never kept or dropped.
      try {
```

Lines 672-679 (the `onStop` handler):

```ts
const timedOut = await raceWithTimeout(flushAll(options), timeoutMs)
// A zero timeout means the caller opted out of waiting, so the flush
// "timing out" is expected and not worth reporting.
if (timedOut && timeoutMs > 0) {
  reportShutdownTimeout(options.config?.onError, timeoutMs)
}
```

### Three false docs

`packages/logixlysia/src/index.ts:259-269` documents `readableResponseHeaders` and ends with "Only built when an enricher will actually read it." The only call site, lines 439-450 inside `closeRequest`, is:

```ts
if (enrichers) {
  applyResponseEnrichers(
    enrichers,
    contextStore,
    {
      durationMs: elapsedMs(store.beforeTime),
      headers: readableResponseHeaders(setHeaders, responseHeaders),
      request,
      status
    },
    onSinkError
  )
}
```

`enrichers` is `ResolvedEnrichers | undefined` from `src/context/enrich.ts:15-18`, `{ request: RequestPhase[]; response: ResponsePhase[] }`, and `resolveEnrichers` returns an object whenever at least one enricher of either phase exists. So the headers are merged for a plugin that registers only request-phase enrichers.

`packages/logixlysia/src/index.ts:689-691` (inside `onRequest`):

```ts
// Written now, not when the line is written: the wrap runs after
// the Response exists, and a short-circuit never reaches the hooks.
set.headers[requestIdConfig.header] = requestId
```

`closeRequest` writes the same header again at lines 426-431 (`setHeaders[requestIdConfig.header] = id`), which runs when the line is written. Both writes stay; only the comment is wrong.

`packages/logixlysia/src/logger/create-logger.ts:36-38`:

```ts
// pino-pretty's shorthand for `yyyy-mm-dd HH:MM:ss.SSS` (minus the `o`
// timezone-offset token, which this formatter does not support).
const STANDARD_TIMESTAMP_PATTERN = 'yyyy-mm-dd HH:MM:ss.SSS'
```

`node_modules/pino-pretty/lib/constants.js:10` is `DATE_FORMAT: 'yyyy-mm-dd HH:MM:ss.l o'`. pino-pretty's token for milliseconds is `l`, not `SSS`.

### Repo facts

- Bun 1.3.14 workspaces with Turborepo. The published package is `packages/logixlysia`, an Elysia logging plugin. Other workspaces: `apps/docs` (the Blume docs site), `apps/elysia` (a playground app), `packages/bench` (vitest benchmarks), `packages/video` (a Remotion promo).
- `origin/main` is `7dea942` ("Version Packages (#524)"). A local `main` may lag behind it; this plan is written against `7dea942` and the branch must start there.
- Lint and format are Ultracite (oxlint and oxfmt). `bun run lint` runs both and fails on any finding. Rules that shape this plan:
  - `no-empty` is an error: a block needs a statement or a comment. Never delete the only comment inside a `catch {}` or a function body unless a step here says what replaces it.
  - `typescript/ban-ts-comment` is an error and requires a description after every `@ts-expect-error`. Do not touch those lines.
  - `typescript/consistent-type-definitions` is an error: object types stay `interface`.
  - `promise/prefer-await-to-then` is an error in `src/` and off under `__tests__/`.
  - `unicorn/no-useless-undefined`, `no-useless-return`, `no-use-before-define` and `func-style` (arrow functions) are errors.
  - Never turn a rule off and never add an `oxlint-disable` comment. If lint rejects a change, restructure the code. If you cannot, STOP.
- `turbo` appends a block marked `<!-- BEGIN:turborepo-agent-rules -->` to `AGENTS.md` when it detects an AI agent. That change is not part of this plan: run `git checkout -- AGENTS.md` before every commit and never stage `AGENTS.md`.
- The repo signs commits through 1Password, which an agent session cannot reach. Commit with `git -c commit.gpgsign=false commit ...` and say so in your report.
- Every comment this plan deletes was read against the code at `7dea942` and judged to restate it, narrate it, duplicate a nearby doc, or carry history a test now pins. The comments left in place were judged to carry a reason the code cannot show. Do not delete anything that is not listed, and do not keep anything that is.

## Commands you will need

| Purpose | Command (worktree root unless noted) | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | `710 pass`, `0 fail` (at `7dea942` and when this plan is done) |
| One test directory | `cd packages/logixlysia && bun test __tests__/logger` | all pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/index.ts`
- `packages/logixlysia/src/errors.ts`
- `packages/logixlysia/src/context/request-context.ts`
- `packages/logixlysia/src/logger/create-logger.ts`
- `packages/logixlysia/src/logger/handle-http-error.ts`
- `packages/logixlysia/src/logger/index.ts`
- `packages/logixlysia/__tests__/plugin/concurrent-timing.test.ts`
- `packages/logixlysia/__tests__/types/typed-fields.test.ts`
- `packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts`
- `.changeset/format-token-list.md` (create)

**Out of scope** (do NOT touch):

- The `closeRequest`, `finishRequest` and `settleStream` docs in `src/index.ts` (lines 411-419, 484-492, 539-544) and the comment at 628-630: they describe the request record's state transitions and stay until that state machine is reshaped (a backlog item).
- `src/logger/index.ts:178-179` (the `ZERO_STORE` comment): stays until `EmitInput` is reshaped (backlog).
- Both `@ts-expect-error` lines in `src/index.ts` and every comment that cites Elysia or Bun behaviour.
- `src/context/request-context.ts` beyond line 1; `peekContext` stays.
- Any other test file, and `src/logger/emit.ts`.

## Git workflow

- Branch: `improve/064-prune-plugin-core-second-pass`, created in Step 0 from `7dea942`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(enrichers): keep set-cookie from both the Response and set.headers`).
- Commit with `git -c commit.gpgsign=false commit -m "<subject>"`.
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git rev-parse --short origin/main` → `7dea942`. If not, STOP (the reviewer fetches `origin/main` before dispatching).
2. `git switch -c improve/064-prune-plugin-core-second-pass 7dea942`. If that branch already exists, STOP.
3. `bun install --frozen-lockfile` → exit 0.
4. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
5. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`. If any fails before you changed anything, STOP.
6. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

A script deletes exact line ranges so none is mistyped. It refuses to write anything if a range does not start with the expected text or is not a whole comment.

1. `mkdir -p /tmp/prune-064`. Save Appendix A verbatim as `/tmp/prune-064/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-064/spec.txt`.
2. From the worktree root: `bun /tmp/prune-064/prune-comments.ts /tmp/prune-064/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `7dea942`: STOP and report it.
3. `bun /tmp/prune-064/prune-comments.ts /tmp/prune-064/spec.txt` → `removed 31 comment lines across 8 files`.
4. `bun run format` → exit 0.
5. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `710 pass`, `0 fail`.
6. `git checkout -- AGENTS.md`. `git status --short` lists only files that appear in Appendix B.
7. **Commit**: `chore(core): drop comments the code and its tests already state`

**Verify**: `git show --stat HEAD` → 8 files. `git show HEAD | grep '^+' | grep -v '^+++'` prints only lines the formatter re-folded (no new words).

### Step 2: Derive the format-token regex from one list

All edits are in `packages/logixlysia/src/logger/create-logger.ts`.

1. Replace the two lines of `LOG_FORMAT_REGEX` (the `const LOG_FORMAT_REGEX =` line and the regex literal line under it) with:

```ts
const FORMAT_TOKENS = [
  'now',
  'epoch',
  'level',
  'icon',
  'duration',
  'method',
  'pathname',
  'path',
  'query',
  'status',
  'statusText',
  'message',
  'ip',
  'context',
  'service',
  'speed',
  'requestId'
] as const

type FormatToken = `{${(typeof FORMAT_TOKENS)[number]}}`

const LOG_FORMAT_REGEX = new RegExp(
  `\\{(?:${FORMAT_TOKENS.join('|')})\\}`,
  'gu'
)
```

The order of the names is the order in the old regex. The new regex matches exactly the same strings (`\{(?:now|epoch|...|requestId)\}` with the `g` and `u` flags).

2. Delete the whole `/** ... */` block directly above `export const createFormatContext` (the one that starts "Resolves colors/format/thresholds/service once per logger instance" and ends with the `NOTE:` about `LOG_FORMAT_REGEX`). `createFormatContext` keeps no doc.

3. In `formatLogOutput`, change the `tokenMap` declaration from `const tokenMap: Record<string, string> = {` to `const tokenMap: Record<FormatToken, string> = {`. Its 17 entries do not change.

4. Replace

```ts
const main = format.replace(LOG_FORMAT_REGEX, match => tokenMap[match] ?? match)
```

with

```ts
const main = format.replace(
  LOG_FORMAT_REGEX,
  match => tokenMap[match as FormatToken]
)
```

The `?? match` fallback was dead: the regex only ever yields a key of `tokenMap`. The cast is the one place a regex match meets the type; the regex is built from the same list the type is built from.

5. `bun run format` → exit 0. `bun run typecheck` → exit 0. `bun run lint` → exit 0. If lint flags `new RegExp`, STOP and report the rule name (it should not: `prefer-regex-literals` only fires on a plain string literal argument).
6. Prove the type carries the old NOTE: add the word `'bogus'` as one more entry in `FORMAT_TOKENS`, run `bun run typecheck` → it fails and the error mentions `'{bogus}'` missing from the `tokenMap` object (a `Property '{bogus}' is missing in type ...` message). Remove `'bogus'` again. `bun run typecheck` → exit 0.
7. `cd packages/logixlysia && bun test __tests__/logger` → all pass. `bun test` → `710 pass`, `0 fail`.
8. `git checkout -- AGENTS.md`. `git status --short` → only `packages/logixlysia/src/logger/create-logger.ts`.

**Commit**: `refactor(logger): derive the format-token regex from one list`

**Verify**: `grep -c 'FORMAT_TOKENS' packages/logixlysia/src/logger/create-logger.ts` → `3` or more; `grep -c 'NOTE: adding a new format token' packages/logixlysia/src/logger/create-logger.ts` → `0`.

### Step 3: Name the two conditions the comments explained

Both edits are in `packages/logixlysia/src/index.ts`.

1. In `finishRequest`, replace

```ts
    const owner = lineOwners.get(request)
    if (record.seenByWrap && owner !== undefined && owner !== instance) {
      // Another instance's route hooks wrote this request's line. Still
      // resolve this instance's tail sampling, or what it buffered for the
      // request (a `useLogger()` call, say) is never kept or dropped.
      try {
```

with

```ts
    const owner = lineOwners.get(request)
    const lineWrittenByAnotherInstance =
      record.seenByWrap && owner !== undefined && owner !== instance
    if (lineWrittenByAnotherInstance) {
      try {
```

2. In the `onStop` handler, replace

```ts
      const timedOut = await raceWithTimeout(flushAll(options), timeoutMs)
      // A zero timeout means the caller opted out of waiting, so the flush
      // "timing out" is expected and not worth reporting.
      if (timedOut && timeoutMs > 0) {
```

with

```ts
      const timedOut = await raceWithTimeout(flushAll(options), timeoutMs)
      const waitWasRequested = timeoutMs > 0
      if (timedOut && waitWasRequested) {
```

3. `bun run format`, `bun run lint`, `bun run typecheck` → exit 0. `cd packages/logixlysia && bun test __tests__/plugin` → all pass.

**Commit**: `refactor(core): name the conditions two comments explained`

**Verify**: `grep -c "Another instance's route hooks\|A zero timeout means" packages/logixlysia/src/index.ts` → `0`.

### Step 4: Build the readable response headers only for response enrichers

In `packages/logixlysia/src/index.ts`, inside `closeRequest`, change

```ts
    if (enrichers) {
      applyResponseEnrichers(
```

to

```ts
    if (enrichers && enrichers.response.length > 0) {
      applyResponseEnrichers(
```

There is exactly one `applyResponseEnrichers(` call in the file; do not touch the `if (enrichers) {` that precedes `applyRequestEnrichers(` in `onRequest`. With zero response hooks `applyResponseEnrichers` merged nothing, so this is not a behaviour change; it makes the last sentence of the `readableResponseHeaders` doc ("Only built when an enricher will actually read it.") true.

**Verify**: `bun run typecheck` → exit 0. `cd packages/logixlysia && bun test __tests__/enrichers` → all pass (these include request-only enrichers, e.g. `a bare function is treated as the request phase`). `grep -c 'enrichers.response.length > 0' packages/logixlysia/src/index.ts` → `1`.

**Commit**: `refactor(enrichers): build the readable response headers only for response enrichers`

### Step 5: Correct the request-id and pino-pretty comments

1. In `packages/logixlysia/src/index.ts`, replace

```ts
// Written now, not when the line is written: the wrap runs after
// the Response exists, and a short-circuit never reaches the hooks.
```

with

```ts
// Set at the start as well as at close: a short-circuited request
// never reaches the later hooks, and the wrap runs after the Response
// exists.
```

2. In `packages/logixlysia/src/logger/create-logger.ts`, replace

```ts
// pino-pretty's shorthand for `yyyy-mm-dd HH:MM:ss.SSS` (minus the `o`
// timezone-offset token, which this formatter does not support).
```

with

```ts
// pino-pretty's `standard` expands to `yyyy-mm-dd HH:MM:ss.l o`; this
// formatter has no `l` or `o` token, so it uses `SSS` and drops the offset.
```

**Verify**: `grep -c "DATE_FORMAT: 'yyyy-mm-dd HH:MM:ss.l o'" node_modules/pino-pretty/lib/constants.js` → `1`. `bun run lint` → exit 0.

**Commit**: `docs(core): correct the request-id header and pino-pretty comments`

### Step 6: Add the changeset

Create `.changeset/format-token-list.md`:

```md
---
'logixlysia': patch
---

The access-log format tokens are defined in one list that both the matcher and the token table are derived from, so a token cannot be added to one without the other. The response headers handed to enrichers are merged only when a response-phase enricher is registered. No behavior change.
```

**Commit**: `chore: add a changeset for the format-token list`

### Step 7: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B 7dea942..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff 7dea942..HEAD | grep -c '^+.*oxlint-disable'` → `0`.
8. `git diff --name-only 7dea942..HEAD` lists only files from the Scope section.

## Test plan

- No new tests. Step 2's type-level check (adding `'bogus'`) is the test for the format-token list; the executor runs it once and reverts it.
- `__tests__/logger/*` cover every format token through `formatLogOutput`; `__tests__/enrichers/*` cover request-only and response-phase enrichers; `__tests__/plugin/lifecycle.test.ts` covers `useLogger()` after a request.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`
- [ ] `git diff --name-only 7dea942..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `grep -c 'NOTE: adding a new format token' packages/logixlysia/src/logger/create-logger.ts` → `0`
- [ ] `grep -c 'tokenMap: Record<FormatToken, string>' packages/logixlysia/src/logger/create-logger.ts` → `1`
- [ ] `grep -c 'enrichers.response.length > 0' packages/logixlysia/src/index.ts` → `1`
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `7dea942`).
- A verification fails twice after a reasonable fix attempt.
- Lint rejects `new RegExp(...)` or the `as FormatToken` cast and you cannot find a comment-free, suppression-free shape.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.

## Maintenance notes

- To add a format token: add its name to `FORMAT_TOKENS`, add its `{name}` entry to `tokenMap`, and add a gating check only if its value is expensive to compute. `tsc` now fails if the map entry is missing.
- Reviewers should check that the regex built in Step 2 is byte-identical in meaning to the old literal (same names, same order, flags `gu`).
- Deferred on purpose: reshaping `RequestRecord` into an explicit state machine (which would let the `closeRequest`, `finishRequest`, `settleStream` docs go), reshaping `EmitInput` so the replay path needs no `ZERO_STORE`, and removing `peekContext`. Each is recorded in `plans/README.md` under the refactor backlog.

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
packages/logixlysia/src/index.ts|245|245|// Elysia's `SingletonBase` slots are `Record<st
packages/logixlysia/src/index.ts|459|463|/**
packages/logixlysia/src/errors.ts|71|71|/** Log-only diagnostics; see the class doc. */
packages/logixlysia/src/context/request-context.ts|1|1|/** HTTP `Request` or WebSocket instance for acc
packages/logixlysia/src/logger/handle-http-error.ts|38|40|// A thrown status() is logged at its own code's
packages/logixlysia/src/logger/index.ts|61|65|// Pino (and, when configured, its pino-pretty t
packages/logixlysia/__tests__/plugin/concurrent-timing.test.ts|54|58|// Pre-fix, the request start time was mutated i
packages/logixlysia/__tests__/types/typed-fields.test.ts|5|9|/**
packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts|52|52|/** Serves `hooks` through `wrapWs` and returns
packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts|69|72|/**
```
