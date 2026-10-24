# Plan 058: Prune the plugin core's comments and share its log gate

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b2a8244..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/src/logger packages/logixlysia/src/context packages/logixlysia/src/middleware packages/logixlysia/src/websocket packages/logixlysia/src/config packages/logixlysia/__tests__/_helpers packages/logixlysia/__tests__/context packages/logixlysia/__tests__/integration packages/logixlysia/__tests__/logger packages/logixlysia/__tests__/middleware packages/logixlysia/__tests__/plugin packages/logixlysia/__tests__/websocket` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b2a8244`, 2026-10-23

## Why this matters

The request lifecycle code (`src/index.ts`, `src/logger/`, `src/context/`) carries about 210 comment lines that restate the next line, narrate perf choices ("hoisted once per logger instance"), or describe a design that no longer exists ("as before the wrap existed", "pre-lazy behavior"). They cost every reader time and some are now false. A few comments exist only because the code hides what it does: the same level-filter check is written out four times with a paragraph defending one copy, request records carry fields whose names need a doc comment each, and the `requestId.header` validator re-implements the middleware's fallback with a comment pointing at the other file. This plan deletes the dead weight, corrects the three comments that stay but are wrong, and reshapes those spots so the code says it.

## Current state

- Deletions: Appendix B lists 143 ranges (211 lines) across 34 files, including 48 `/* noop */` lines inside test callbacks. `no-empty-function` is off for `__tests__/**`, so those bodies may be empty.
- Comments that stay but must change, in `packages/logixlysia/src/index.ts` (line numbers at `b2a8244`; Step 1 shifts them, so find them by text):
  - `:589-593` `finishUnwrapped` doc ends with `them into the parent. The hooks then write the line, as before.`
  - `:727-728` in `.onError`:

```ts
// Thrown after the line was written (a route afterHandle, a response
// schema): a second, error line, as before the wrap existed.
```

- `:741-742` in `.onAfterResponse`:

```ts
// An exit that reached neither hook above (a resolve short-circuit, a
// 404, an error an earlier app-wide onError answered).
```

    "a 404" is wrong: with the plugin mounted, Elysia 1.4.30 runs `onError` (`NotFoundError`) for a 404 before `afterResponse` (verified with a script at `b2a8244`).

- `interface RequestRecord` (`packages/logixlysia/src/index.ts:87-103`) needs a doc per field:

```ts
interface RequestRecord {
  /** A custom log replaced the access line for this request. */
  customLogged: boolean
  ...
  /** Elysia pulled the stream wrapper at least once. */
  pulled: boolean
  ...
  /** The status the client got, recorded by the wrap for a stream still running. */
  status?: number
  /** The wrap saw this request. Otherwise the hooks close it, as before the wrap existed. */
  wrapped: boolean
}
```

Uses at `b2a8244`: `customLogged` at lines 89, 317, 356, 531; `pulled` at 95, 177, 218, 319, 625; the `status` field at 100, 549, 553, 568, 569, 631; `wrapped` at 102, 321, 504, 611, 700, 706, 723, 738. Other `status` identifiers in the file (function parameters such as `status: number`, `set.status`, `response.status`) are NOT this field.

- The same gate appears four times. `packages/logixlysia/src/logger/emit.ts:246`, `packages/logixlysia/src/logger/index.ts:201` and `packages/logixlysia/src/logger/handle-http-error.ts:49` use `if (sinks.isEffectivelyDisabled || !shouldLog(level, config?.logFilter)) {`; `packages/logixlysia/src/index.ts:351` uses `if (sinks.isEffectivelyDisabled || !shouldLog(level, logFilter)) {`. Two comments defend copies of it: `handle-http-error.ts:45-48` (`// Mirrors emit()'s own gate check, ...`) and the doc above `const emitCustomLog` in `index.ts:338-344` (`/**` then ` * A custom log inside a request. It applies the same gate ...`). `shouldLog` and the `Sinks` interface are exported from `emit.ts` (`shouldLog` at `:60`).
- `packages/logixlysia/src/config/resolve-options.ts:184-193` re-implements the middleware's header fallback (after Step 1 deletes the `// Typed as string, ...` line):

```ts
  const raw: unknown = requestId.header
  // An empty or blank header falls back to X-Request-Id (request-id.ts).
  const header = typeof raw === 'string' ? raw.trim() : undefined
  if (
    header === undefined ||
    (header !== '' && !HEADER_NAME_REGEX.test(header))
  ) {
    throw new Error(
```

and `packages/logixlysia/src/middleware/request-id.ts:52` holds the real fallback: `header: raw.header?.trim() || DEFAULT_HEADER,` (with `const DEFAULT_HEADER = 'X-Request-Id'` at `:4`). `request-id.ts` imports only `../interfaces` and `../utils/report`, so importing it from `resolve-options.ts` creates no cycle.

- Tests: `packages/logixlysia/__tests__/plugin/shutdown.test.ts:19-22` defines `neverSettles`; `packages/logixlysia/__tests__/plugin/final-line.test.ts` inlines the same idea in `waitForever` (`// Never settles: ...` then `await Promise.withResolvers<undefined>().promise`). `packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts:~85-100` and `wrap-ws-server.test.ts:~48-60` each inline the same open/error/close promise with the comment `// Without these, a socket that never opens leaves the test waiting here ...`. `packages/logixlysia/__tests__/logger/colors.test.ts:324` titles a test `'{context} token inlines JSON when the tree has nothing to show'` while it asserts the token is empty because the tree shows the field. `packages/logixlysia/__tests__/plugin/final-line.test.ts:52-58` uses an empty `catch` with a comment to default a body to `''`.

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

- `packages/logixlysia/src/index.ts` EXCEPT lines 270-295 (`readableResponseHeaders` and its doc: plan 056 rewrites them in parallel)
- `packages/logixlysia/src/logger/create-logger.ts`, `emit.ts`, `handle-http-error.ts`, `index.ts`
- `packages/logixlysia/src/context/enrich.ts`, `request-context.ts`, `storage.ts`
- `packages/logixlysia/src/middleware/request-id.ts`, `packages/logixlysia/src/websocket/wrap-ws.ts`, `packages/logixlysia/src/config/resolve-options.ts`
- `packages/logixlysia/__tests__/_helpers/console.ts`, `sleep.ts`, `never-settles.ts` (create), `await-open.ts` (create)
- `packages/logixlysia/__tests__/context/**`, `packages/logixlysia/__tests__/integration/**`, `packages/logixlysia/__tests__/logger/**`, `packages/logixlysia/__tests__/middleware/**`, `packages/logixlysia/__tests__/plugin/**`, `packages/logixlysia/__tests__/websocket/**`
- `.changeset/plugin-core-comments.md` (create)

**Out of scope** (do NOT touch):

- `packages/logixlysia/src/index.ts:270-295` (plan 056).
- `packages/logixlysia/src/types/**`, `packages/logixlysia/src/utils/**`, `packages/logixlysia/src/output/**`, adapters, `__tests__/enrichers/**`, `__tests__/_helpers/perm-bits.ts` (other plans).
- The two `@ts-expect-error` lines in `src/index.ts` and the comment above the first (it starts `// Elysia's` and cites issue #220). Converting those interfaces to `type` aliases removes the error but fails `typescript/consistent-type-definitions`; that design is out of scope.
- `exitRequestScope`'s doc in `src/index.ts` (it explains the `enterWith(noopRequestLogger)` reset) and `peekContext`'s contract doc in `src/context/request-context.ts`.

## Git workflow

- Branch: `improve/058-prune-plugin-core-comments`, created in Step 0 from `b2a8244`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(logger): log the status the client actually got`).
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git switch -c improve/058-prune-plugin-core-comments`. If that branch already exists, STOP.
2. `bun install --frozen-lockfile` → exit 0.
3. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
4. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`. If any fails before you changed anything, STOP.
5. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

A script deletes exact line ranges so none is mistyped. It refuses to write anything if a range does not start with the expected text or is not a whole comment.

1. `mkdir -p /tmp/prune-058`. Save Appendix A verbatim as `/tmp/prune-058/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-058/spec.txt`.
2. From the worktree root: `bun /tmp/prune-058/prune-comments.ts /tmp/prune-058/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `b2a8244`: STOP and report it.
3. `bun /tmp/prune-058/prune-comments.ts /tmp/prune-058/spec.txt` → `removed 211 comment lines across 34 files`.
4. `bun run format` → exit 0. It folds a now-empty multi-line body such as `() => {\n}` into `() => {}`.
5. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `703 pass`, `0 fail`.
6. `git checkout -- AGENTS.md`. `git status --short` lists only files that appear in Appendix B.
7. **Commit**: `chore(logger): drop comments that restate the code`

**Verify**: `git show --stat HEAD` → 34 files. `git show HEAD | grep '^+' | grep -v '^+++'` prints only lines the formatter re-folded (no new words).

### Step 2: Correct the three comments that stay

In `packages/logixlysia/src/index.ts` (find each by text):

1. `them into the parent. The hooks then write the line, as before.` → `them into the parent. The hooks then write the line.`
2. Replace the two `.onError` lines quoted under "Current state" with:

```ts
// Thrown after the line was written (a route afterHandle, a response
// schema): a second, error line.
```

3. Replace the two `.onAfterResponse` lines with:

```ts
// An exit that reached neither hook above (a resolve short-circuit, or an
// error an earlier app-wide onError answered).
```

**Verify**: `grep -n "as before" packages/logixlysia/src/index.ts` → no output. `bun run lint` → exit 0.

**Commit**: `docs(logger): correct the comments that stay`

### Step 3: Name the request record fields for what they record

In `interface RequestRecord` in `packages/logixlysia/src/index.ts`, rename the fields and delete each one's doc line:

| Old field | New field | Doc line to delete |
| --- | --- | --- |
| `customLogged` | `accessLineReplaced` | `/** A custom log replaced the access line for this request. */` |
| `pulled` | `streamPulled` | `/** Elysia pulled the stream wrapper at least once. */` |
| `status` | `streamStatus` | `/** The status the client got, recorded by the wrap for a stream still running. */` |
| `wrapped` | `seenByWrap` | `/** The wrap saw this request. Otherwise the hooks close it, as before the wrap existed. */` |

Then run `cd packages/logixlysia && bunx tsc --noEmit --emitDeclarationOnly false` and fix every error it reports by renaming that access: `record.customLogged`, `record.pulled`, `record.status`, `record.wrapped`, and the matching keys in the object literal `openRecord` creates. Rename only accesses on a `RequestRecord`.

**Verify**:

1. `grep -nE 'customLogged|record\.pulled|pulled:|record\.wrapped|wrapped:|record\.status\b' packages/logixlysia/src/index.ts` → no output.
2. `bun run typecheck` and `bun run lint` → exit 0; tests → `703 pass`.

**Commit**: `refactor(logger): name request record fields for what they record`

### Step 4: Share one gate check

1. In `packages/logixlysia/src/logger/emit.ts`, directly below `export const shouldLog = ...`, add:

```ts
export const isSuppressed = (
  sinks: Sinks,
  level: LogLevel,
  logFilter?: LogFilter
): boolean => sinks.isEffectivelyDisabled || !shouldLog(level, logFilter)
```

2. Replace the four gate conditions with `isSuppressed(...)`:
   - `emit.ts`, `logger/index.ts`, `logger/handle-http-error.ts`: `if (sinks.isEffectivelyDisabled || !shouldLog(level, config?.logFilter)) {` → `if (isSuppressed(sinks, level, config?.logFilter)) {`
   - `src/index.ts` (`emitCustomLog`): `if (sinks.isEffectivelyDisabled || !shouldLog(level, logFilter)) {` → `if (isSuppressed(sinks, level, logFilter)) {`
3. Delete the comment block above the gate in `handle-http-error.ts` (starts `// Mirrors emit()'s own gate check`, 4 lines) and the doc block above `const emitCustomLog` in `src/index.ts` (starts ` * A custom log inside a request.`, 7 lines). Tests pin both behaviors (`__tests__/plugin/*` cover filtered custom logs and the access line).
4. Update imports: import `isSuppressed` where it is now used; drop `shouldLog` from any import list where it is no longer used (lint reports unused imports).

**Verify**: `grep -rn "isEffectivelyDisabled || !shouldLog" packages/logixlysia/src` → no output. `bun run lint`, `bun run typecheck` → exit 0. Tests → `703 pass`.

**Commit**: `refactor(logger): share one gate check across the log paths`

### Step 5: Validate the request id header the middleware will use

1. In `packages/logixlysia/src/middleware/request-id.ts`, after the `REPORTED_ID_MAX` constant and before `reportGeneratorError`, add:

```ts
export const requestIdHeaderName = (header: string | undefined): string =>
  header?.trim() || DEFAULT_HEADER
```

and in `resolveRequestIdConfig` replace `header: raw.header?.trim() || DEFAULT_HEADER,` with `header: requestIdHeaderName(raw.header),`. 2. In `packages/logixlysia/src/config/resolve-options.ts`, add `import { requestIdHeaderName } from '../middleware/request-id'` and replace the block quoted under "Current state" (from `const raw: unknown = requestId.header` down to `) {` before `throw new Error(`) with:

```ts
  const raw: unknown = requestId.header
  if (
    typeof raw !== 'string' ||
    !HEADER_NAME_REGEX.test(requestIdHeaderName(raw))
  ) {
```

Keep the `throw new Error(...)` and its message unchanged. Behavior is identical: a blank header normalises to `X-Request-Id`, which passes; a non-string still throws.

**Verify**: `cd packages/logixlysia && bun test __tests__/config __tests__/middleware __tests__/plugin/request-id.test.ts` → all pass. `bun run lint`, `bun run typecheck` → exit 0.

**Commit**: `refactor(config): validate the request id header the middleware will use`

### Step 6: Share the test helpers and fix a wrong test title

1. Create `packages/logixlysia/__tests__/_helpers/never-settles.ts`:

```ts
export const neverSettles = (): Promise<void> => {
  const { promise }: PromiseWithResolvers<void> = Promise.withResolvers()
  return promise
}
```

In `__tests__/plugin/shutdown.test.ts` delete the local `neverSettles` and import it from `'../_helpers/never-settles'`. In `__tests__/plugin/final-line.test.ts` (`waitForever`), replace

```ts
// Never settles: an SSE loop waiting for an event that never comes.
await Promise.withResolvers<undefined>().promise
```

with `        await neverSettles()` and add the import. 2. Create `packages/logixlysia/__tests__/_helpers/await-open.ts`:

```ts
export const awaitOpen = (socket: WebSocket): Promise<void> => {
  const {
    promise: opened,
    reject: onOpenFailure,
    resolve: onOpen
  }: PromiseWithResolvers<void> = Promise.withResolvers()
  socket.addEventListener('open', () => onOpen())
  socket.addEventListener('error', () =>
    onOpenFailure(new Error('WebSocket connection failed'))
  )
  socket.addEventListener('close', () =>
    onOpenFailure(new Error('WebSocket closed before opening'))
  )
  return opened
}
```

In `__tests__/websocket/wrap-ws-results.test.ts` and `wrap-ws-server.test.ts`, replace the inline block (from `const {` / `promise: opened,` through the `'close'` listener, including the two-line `// Without these, ...` comment) with `const opened = awaitOpen(socket)`. Keep the later `await opened` where it is, and add the import. 3. In `__tests__/logger/colors.test.ts`, rename the test `'{context} token inlines JSON when the tree has nothing to show'` to `'{context} token stays empty when the context tree already shows the fields'`, and delete its comment `// The tree already renders userId, so the inline {context} token is empty.` 4. In `__tests__/plugin/final-line.test.ts` (`run` helper), replace

```ts
let body = ''
try {
  body = await response.text()
} catch {
  // A body that fails mid-stream still has headers to assert on.
}
```

with `  const body = await response.text().catch(() => '')` (`promise/prefer-await-to-then` is off under `__tests__`). 5. `bun run format`.

**Verify**: `bun run lint` → exit 0. Tests → `703 pass`, `0 fail` (same count: no test added or removed).

**Commit**: `test: share the never-settling promise and socket-open helpers`

### Step 7: Add the changeset

Create `.changeset/plugin-core-comments.md`:

```md
---
'logixlysia': patch
---

Internal cleanup in the plugin core: comments that restated the code are gone, one helper now applies the level filter on every log path, and `requestId.header` is validated through the same normalisation the middleware applies. No behavior or API change.
```

**Commit**: `chore: add a changeset for the plugin-core cleanup`

### Step 8: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B b2a8244..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff b2a8244..HEAD | grep -c '^+.*oxlint-disable'` → `0`.

## Test plan

- No behavior changes, so no new tests. The existing suite (703) must stay green after every step; it pins the behaviors the deleted comments described (filtered custom logs, access line ownership across instances, request id fallback, stream finishing).
- Step 6 only restructures tests; the count must stay 703.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`
- [ ] `git diff --name-only b2a8244..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)
- [ ] `grep -rn "as before\|previous design\|pre-lazy\|pre-optimization" packages/logixlysia/src` → no output
- [ ] `grep -rn "isEffectivelyDisabled || !shouldLog" packages/logixlysia/src` → no output
- [ ] `git diff b2a8244..HEAD -- packages/logixlysia/src/index.ts` shows no hunk inside lines 270-295 of the original file

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `b2a8244`).
- A verification fails twice after a reasonable fix attempt.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.
- Step 3's compiler output includes a `status` use you cannot classify as the `RequestRecord` field.
- Any step would need to edit `readableResponseHeaders` or its doc.

## Maintenance notes

- `isSuppressed` is now the single place the level filter and the all-sinks-off check meet. A new log path must call it rather than re-deriving the condition.
- `requestIdHeaderName` is shared by validation and the middleware; change the fallback in one place only.
- Left in place on purpose: the Elysia lifecycle comments in `src/index.ts` (stream handling, hook ordering, dedupe of plugin instances), `exitRequestScope`'s doc, `peekContext`'s contract, and the two `@ts-expect-error` lines. Each records behavior of a dependency or a contract the code cannot show.

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
packages/logixlysia/src/index.ts|90|90|/** The value `onError` saw, or the error a stre
packages/logixlysia/src/index.ts|92|92|/** `open` until the final line is written; `str
packages/logixlysia/src/index.ts|96|96|/** The live `set.headers` of the request, for t
packages/logixlysia/src/index.ts|141|145|/**
packages/logixlysia/src/index.ts|158|158|/** {@link returnRecordingError} for a sync gene
packages/logixlysia/src/index.ts|193|194|// Delegation forwards every later value, the re
packages/logixlysia/src/index.ts|302|303|// Per instance: an app that forwards a request
packages/logixlysia/src/index.ts|698|699|// The wrap scopes the logger for the requests i
packages/logixlysia/src/logger/create-logger.ts|32|32|// Avoid ANSI sequences in non-interactive outpu
packages/logixlysia/src/logger/create-logger.ts|40|40|// `SYS:` and `UTC:` are the same length.
packages/logixlysia/src/logger/create-logger.ts|43|48|/**
packages/logixlysia/src/logger/create-logger.ts|87|87|/** Resolves client IP from x-forwarded-for (fir
packages/logixlysia/src/logger/create-logger.ts|157|157|/** Logixlysia brand: fox emoji with level-color
packages/logixlysia/src/logger/create-logger.ts|229|233|/**
packages/logixlysia/src/logger/create-logger.ts|298|298|/** Format tokens actually present in `format` (
packages/logixlysia/src/logger/create-logger.ts|354|354|/** Nested objects to expand in the context tree
packages/logixlysia/src/logger/create-logger.ts|459|460|// WARNING as well as ERROR: a 4xx is logged at
packages/logixlysia/src/logger/create-logger.ts|470|471|// No length cap, as before. This still strips t
packages/logixlysia/src/logger/create-logger.ts|478|478|/** Raw duration/URL parts computed once per log
packages/logixlysia/src/logger/create-logger.ts|485|485|/** `{now}`/`{epoch}` share a single `Date` samp
packages/logixlysia/src/logger/create-logger.ts|513|513|/** `{pathname}`/`{path}`/`{query}` share a sing
packages/logixlysia/src/logger/create-logger.ts|550|550|/** `{status}`/`{statusText}` share a single sta
packages/logixlysia/src/logger/create-logger.ts|602|602|/** `{duration}`/`{speed}` share a single durati
packages/logixlysia/src/logger/create-logger.ts|660|660|/** Hoisted per-logger constants; computed on th
packages/logixlysia/src/logger/create-logger.ts|662|662|/** Duration/URL parts already computed by the c
packages/logixlysia/src/logger/emit.ts|20|24|/**
packages/logixlysia/src/logger/emit.ts|29|29|/** True when no sink is active at all: `log()`/
packages/logixlysia/src/logger/emit.ts|31|31|/** True when at least one active sink reads pat
packages/logixlysia/src/logger/emit.ts|67|67|/** Parses the URL once; only called when at lea
packages/logixlysia/src/logger/emit.ts|79|84|/**
packages/logixlysia/src/logger/emit.ts|120|120|/** Skips the sampling gate; set when replaying
packages/logixlysia/src/logger/emit.ts|122|122|/** Shared per-request context bag (peeked, neve
packages/logixlysia/src/logger/emit.ts|125|125|/** Duration captured when a record was buffered
packages/logixlysia/src/logger/emit.ts|127|127|/** Hoisted per-logger constants for `formatLogO
packages/logixlysia/src/logger/emit.ts|132|132|/** Hoisted per-logger sampling runtime; undefin
packages/logixlysia/src/logger/emit.ts|134|134|/** Hoisted per-logger sink gates from {@link re
packages/logixlysia/src/logger/emit.ts|139|139|/** Shared by `emit` and `handleHttpError` so fo
packages/logixlysia/src/logger/emit.ts|160|161|// mergeLogDataContext only reads/spreads this b
packages/logixlysia/src/logger/emit.ts|194|194|// file.ts reports a failed write itself (consol
packages/logixlysia/src/logger/emit.ts|228|232|/**
packages/logixlysia/src/logger/emit.ts|256|257|// Buffered raw: context merge, redaction and fo
packages/logixlysia/src/logger/emit.ts|267|267|// Logging must never fail the request it descri
packages/logixlysia/src/logger/handle-http-error.ts|18|18|/** The status a thrown value maps to; anything
packages/logixlysia/src/logger/handle-http-error.ts|53|53|// emit guards its own work; this covers normali
packages/logixlysia/src/logger/index.ts|22|25|/**
packages/logixlysia/src/logger/index.ts|115|116|// Explicit config.pino means the user opted in
packages/logixlysia/src/logger/index.ts|131|132|// Hoisted once per logger instance: colors/form
packages/logixlysia/src/logger/index.ts|137|137|// Resolved once per logger instance: none of th
packages/logixlysia/src/logger/index.ts|160|160|/** Resolves the tail verdict and re-emits whate
packages/logixlysia/src/context/enrich.ts|15|15|/** Enricher phases split so each request only w
packages/logixlysia/src/context/enrich.ts|21|21|/** Splits configured enrichers by phase, or `un
packages/logixlysia/src/context/enrich.ts|50|54|/**
packages/logixlysia/src/context/request-context.ts|63|63|/** Accumulated request context first; explicit
packages/logixlysia/src/context/storage.ts|7|11|/**
packages/logixlysia/src/context/storage.ts|33|34|// The stored logger writes into an untyped cont
packages/logixlysia/src/middleware/request-id.ts|44|44|// Object form — `enabled` defaults to `true` wh
packages/logixlysia/src/websocket/wrap-ws.ts|20|21|// Synthetic requests are only read (method/url)
packages/logixlysia/src/websocket/wrap-ws.ts|43|43|/** Runs `done` once `pending` settles, then han
packages/logixlysia/src/websocket/wrap-ws.ts|89|89|// Read-only: immediately spread below into a ne
packages/logixlysia/src/config/resolve-options.ts|185|185|// Typed as string, but a JavaScript caller can
packages/logixlysia/__tests__/_helpers/sleep.ts|1|1|/** `new Promise(resolve => setTimeout(resolve,
packages/logixlysia/__tests__/integration/demo-app.ts|9|9|/** Mirrors apps/elysia demo routes for integrat
packages/logixlysia/__tests__/integration/demo-app.ts|41|41|// e.g. "Not Found" — exercises string statuses
packages/logixlysia/__tests__/logger/create-logger.test.ts|50|50|// transport should be invoked synchronously
packages/logixlysia/__tests__/logger/create-logger.test.ts|58|58|// internal console output should be disabled
packages/logixlysia/__tests__/logger/create-logger.test.ts|67|67|// Avoid unhandled async noise if any transport
packages/logixlysia/__tests__/logger/colors.test.ts|32|34|/** Creates a logger with `config`, runs `act` a
packages/logixlysia/__tests__/logger/handle-http-error.test.ts|125|128|// Elysia route handlers may only throw Error in
packages/logixlysia/__tests__/logger/handle-http-error.test.ts|143|147|// Class names (and thus `.name`/`.constructor.n
packages/logixlysia/__tests__/logger/handle-http-error.test.ts|174|176|// The error path honors the same sink gates as
packages/logixlysia/__tests__/logger/handle-http-error.test.ts|203|205|// Pins decided drift #3 from plans/017: console
packages/logixlysia/__tests__/context/request-context.test.ts|45|46|// Same reference as the internally stored bag:
packages/logixlysia/__tests__/context/async-storage.test.ts|50|50|// Nested async operation using actual Promise r
packages/logixlysia/__tests__/plugin/store-pino.test.ts|35|36|// Captures the call instead of writing it, so p
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|124|124|// Should not log INFO level requests when filte
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|146|146|// Should log INFO level when no filter is appli
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|172|172|// Should be filtered out
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|174|174|// Should be allowed
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|207|207|// Should log INFO level when filter level array
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|236|236|// ERROR-level HTTP exceptions must be suppresse
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|263|263|// ERROR-level HTTP exceptions must be logged wh
packages/logixlysia/__tests__/plugin/request-id.test.ts|35|35|// UUID v4 format
packages/logixlysia/__tests__/plugin/request-id.test.ts|81|81|// Response header should reflect the incoming I
packages/logixlysia/__tests__/plugin/request-id.test.ts|84|84|// Transport should also receive the incoming ID
packages/logixlysia/__tests__/plugin/request-id.test.ts|109|109|// No X-Request-Id header on response
packages/logixlysia/__tests__/plugin/request-id.test.ts|112|112|// No requestId in log context
packages/logixlysia/__tests__/plugin/request-id.test.ts|132|132|// Should use the custom header name
packages/logixlysia/__tests__/plugin/request-id.test.ts|134|134|// Default header should not be set
packages/logixlysia/__tests__/plugin/request-id.test.ts|265|267|// The transport receives unformatted data, but
packages/logixlysia/__tests__/middleware/request-id.test.ts|26|26|// default generator produces UUID v4 format
packages/logixlysia/__tests__/plugin/shutdown.test.ts|18|18|/** A flush that never settles, to exercise the
packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts|25|27|// Bun may report an unhandled rejection through
packages/logixlysia/__tests__/plugin/final-line.test.ts|535|536|// A NaN maxAge (an unset TTL, say) cannot be se
packages/logixlysia/__tests__/plugin/final-line.test.ts|541|541|// The rejection reaches the caller untouched; a
packages/logixlysia/__tests__/plugin/status-resolution.test.ts|189|189|// The earlier app-wide onError answered, so the
packages/logixlysia/__tests__/_helpers/console.ts|14|14|/* noop */
packages/logixlysia/__tests__/_helpers/console.ts|17|17|/* noop */
packages/logixlysia/__tests__/_helpers/console.ts|20|20|/* noop */
packages/logixlysia/__tests__/_helpers/console.ts|23|23|/* noop */
packages/logixlysia/__tests__/_helpers/console.ts|26|26|/* noop */
packages/logixlysia/__tests__/integration/demo-routes.test.ts|10|10|/* noop */
packages/logixlysia/__tests__/logger/create-logger.test.ts|33|33|/* noop */
packages/logixlysia/__tests__/logger/create-logger.test.ts|75|75|/* noop */
packages/logixlysia/__tests__/logger/create-logger.test.ts|108|108|/* noop */
packages/logixlysia/__tests__/logger/create-logger.test.ts|147|147|/* noop */
packages/logixlysia/__tests__/plugin/store-pino.test.ts|11|11|/* noop */
packages/logixlysia/__tests__/plugin/store-pino.test.ts|38|38|/* noop */
packages/logixlysia/__tests__/plugin/multiple-instances.test.ts|17|17|/* noop */
packages/logixlysia/__tests__/plugin/status-resolution.test.ts|16|16|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|14|14|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|61|61|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|95|95|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|153|153|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|173|173|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|176|176|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|214|214|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|217|217|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|250|250|/* noop */
packages/logixlysia/__tests__/plugin/request-id.test.ts|278|278|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|10|10|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|28|28|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|51|51|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|83|83|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|107|107|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|132|132|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|156|156|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|190|190|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|217|217|/* noop */
packages/logixlysia/__tests__/plugin/logixlysia.test.ts|244|244|/* noop */
packages/logixlysia/__tests__/plugin/request-context.test.ts|11|11|/* noop */
packages/logixlysia/__tests__/plugin/request-context.test.ts|41|41|/* noop */
packages/logixlysia/__tests__/plugin/request-context.test.ts|75|75|/* noop */
packages/logixlysia/__tests__/plugin/request-context.test.ts|107|107|/* noop */
packages/logixlysia/__tests__/plugin/final-line.test.ts|18|18|/* noop */
packages/logixlysia/__tests__/plugin/never-throws.test.ts|119|119|/* noop */
packages/logixlysia/__tests__/plugin/lifecycle.test.ts|16|16|/* noop */
packages/logixlysia/__tests__/websocket/wrap-ws-server.test.ts|17|17|/* noop */
packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts|13|13|/* noop */
packages/logixlysia/__tests__/websocket/wrap-ws.test.ts|14|14|/* noop */
packages/logixlysia/__tests__/websocket/wrap-ws.test.ts|62|62|/* noop */
packages/logixlysia/__tests__/websocket/wrap-ws.test.ts|65|65|/* noop */
packages/logixlysia/__tests__/websocket/wrap-ws.test.ts|68|68|/* noop */
packages/logixlysia/__tests__/websocket/wrap-ws.test.ts|89|89|/* noop */
```
