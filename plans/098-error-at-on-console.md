# Plan 098: The console tree says where a server error was thrown

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 91fd02f..HEAD -- packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/__tests__/logger/format-output.test.ts apps/docs/content/features/formatting.mdx apps/elysia/demo.tape` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `91fd02f`, 2026-11-08

## Why this matters

Measured on Bun 1.3.14 with Elysia 1.4.30: a bare Elysia app prints nothing for an unhandled handler error, and with this plugin's `dev` preset the developer sees only `GET /boom 500 2ms db exploded` and `└─ error  db exploded`. The stack reaches transports since plan 093, but the person at the terminal has to add a `console.error` to learn which line threw. One tree line, `error.at  src/routes/pay.ts:42:11`, the first frame outside `node_modules`, closes that gap at no cost to production sinks.

## Current state

- `packages/logixlysia/src/logger/create-logger.ts` lines 456-480:

```ts
const collectStructuredErrorEntries = (error: unknown): [string, string][] => {
  const entries: [string, string][] = []
  const msg = parseError(error)
  if (msg) {
    entries.push(['error', sanitizeLogText(msg)])
  }
  if (isStructuredError(error)) {
    if (error.code !== undefined) {
      entries.push(['error.code', sanitizeLogText(error.code)])
    }
    ...
```

It is called from `buildContextTreeLines` for `ERROR` and `WARNING` records that have `data.error`. On the plugin path `data.error` is the record `normalizeLoggedError` built, which has a string `stack` only for server errors (`src/utils/error.ts` sets `safe.stack` unless the error's own `status` is below 500). In `buildContextTreeLines` unit tests, `data.error` is a raw `Error`.

- Measured Bun 1.3.14 stack frames take these forms (absolute paths, some with a `file://` prefix):

```
    at deep (/home/me/app/src/pay.ts:3:32)
    at handle (file:///home/me/app/node_modules/elysia/dist/compose.mjs:6:76)
    at /home/me/app/src/pay.ts:9:11
    at async <anonymous> (/home/me/app/src/pay.ts:8:38)
```

- `packages/logixlysia/__tests__/logger/format-output.test.ts` lines 311-320 assert `lines.length` is 1 for `{ error: new Error('nope') }`, and lines 330-367 assert 5 lines for `CustomStructuredError`, with `lines[1]` being `error.why`. Both errors are built in the test file, so they will gain an `error.at` line.
- `apps/docs/content/features/formatting.mdx` lines 126-139 list the tree branches and claim `error.cause` is rendered as a branch. Measured: the tree never renders `cause`; it reaches transports as `error.cause`.
- `apps/elysia/demo.tape` is sized so the whole demo fits one screen (`Set Height 940`, comment at lines 19-23); `curl localhost:3001/boom` (line 83) will print one more tree line, so the terminal needs one more row or every later `Wait+Screen` times out. The terminal-recording workflow runs the tape on each PR.
- Conventions: Ultracite lint (never ignore comments), `bun:test`, comments only for a non-obvious why, changeset required.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install (fresh worktree) | `bun install --frozen-lockfile` | exit 0 |
| Lint + format check | `bun run lint` (repo root) | exit 0 |
| Format | `bun run format` (repo root) | exit 0 |
| Typecheck | `bun run typecheck` (repo root) | exit 0 |
| Build + tests | `cd packages/logixlysia && bun run build && bun test` | all pass |

Run `git checkout -- AGENTS.md` before every commit (turbo may edit it) and stage by path.

## Scope

**In scope**:

- `packages/logixlysia/src/logger/create-logger.ts`
- `packages/logixlysia/__tests__/logger/format-output.test.ts`
- `packages/logixlysia/__tests__/plugin/error-at.test.ts` (create)
- `apps/docs/content/features/formatting.mdx`
- `apps/elysia/demo.tape`
- `.changeset/error-at-on-console.md` (create)

**Out of scope**:

- `packages/logixlysia/src/utils/error.ts` and transports: the full `stack` already reaches them; nothing changes there.
- The file sink output.
- Any new config option.

## Git workflow

- Branch from `91fd02f`: `improve/098-error-at-on-console`.
- Commits: `feat(output): show where a server error was thrown on the console`, then `docs(formatting): document error.at and correct the cause branch`.
- No push, no PR.

## Steps

### Step 1: Find the first application frame

In `packages/logixlysia/src/logger/create-logger.ts`, add above `collectStructuredErrorEntries`:

```ts
const FRAME_LOCATION_REGEX = /\(?(?<location>[^\s()]+:\d+:\d+)\)?$/u
const FILE_URL_PREFIX = 'file://'
const MAX_LOCATION_LENGTH = 256

const isInternalFrame = (location: string): boolean =>
  location.includes('/node_modules/') ||
  location.includes('\\node_modules\\') ||
  location.startsWith('node:') ||
  location.startsWith('bun:') ||
  location.startsWith('native')

const relativeToCwd = (location: string): string => {
  const cwd = `${process.cwd()}/`
  return location.startsWith(cwd) ? location.slice(cwd.length) : location
}

/** The first `path:line:col` outside node_modules and the runtime, or undefined. */
const thrownAt = (stack: string): string | undefined => {
  for (const line of stack.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('at ')) {
      continue
    }
    const location = FRAME_LOCATION_REGEX.exec(trimmed)?.groups?.location
    if (location === undefined) {
      continue
    }
    const path = location.startsWith(FILE_URL_PREFIX)
      ? location.slice(FILE_URL_PREFIX.length)
      : location
    if (!isInternalFrame(path)) {
      return relativeToCwd(path)
    }
  }
  return
}
```

Then in `collectStructuredErrorEntries`, right after the `['error', ...]` push, add:

```ts
const stack =
  typeof error === 'object' && error !== null && 'stack' in error
    ? error.stack
    : undefined
const at = typeof stack === 'string' ? thrownAt(stack) : undefined
if (at !== undefined) {
  entries.push(['error.at', sanitizeLogText(at, MAX_LOCATION_LENGTH)])
}
```

Keep the regex at module level (no regex literals inside the loop body; the lint rule forbids them). If the lint complains about cognitive complexity, split `thrownAt` into a per-line helper rather than adding an ignore.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Tests

In `__tests__/logger/format-output.test.ts`, `describe('buildContextTreeLines')`:

- Change "adds error line for ERROR level with error field" to expect 2 lines, `lines[0]` containing `error` and `nope`, `lines[1]` containing `error.at` and `format-output.test.ts:`.
- In the `CustomStructuredError` test, expect 6 lines, with `error.at` at index 1 and the `why`/`fix`/`link`/`internal` assertions shifted by one.
- Add: an error whose `stack` is replaced by frames only inside `node_modules` and `node:` (assign `error.stack = 'Error: x\n    at a (/app/node_modules/x/index.js:1:1)\n    at node:internal/process/task_queues:95:5'`) → exactly 1 line, none containing `error.at`.
- Add: a stack frame with a `file://` prefix and a bare form `at file:///tmp/app/src/x.ts:3:4` → the `error.at` value contains `/tmp/app/src/x.ts:3:4` and not `file://`.
- Add: a `WARNING` record with `{ error: { message: 'm', stack: '    at /x/y.ts:1:2' } }` → 2 lines (the tree runs for WARNING too).

Create `__tests__/plugin/error-at.test.ts`, modelled on `__tests__/plugin/log-error.test.ts`, using `spyConsole(['error', 'warn', 'info'])` from `../_helpers/console` and `config: { disableFileLogging: true, useColors: false }`:

1. A handler that throws `new Error('db exploded')` → the joined console text matches `/error\.at\s+\S*__tests__\/plugin\/error-at\.test\.ts:\d+:\d+/`.
2. A handler that throws `new HttpError(404, 'nope')` → the console text does not contain `error.at`.
3. A transport added alongside receives `meta.error.stack` as a string that contains `error-at.test.ts` (the full stack is unchanged).

Check that test 1 fails against the unfixed source once (stash, run, pop) and report it.

**Verify**: `cd packages/logixlysia && bun run build && bun test` → all pass.

### Step 3: Docs, tape, changeset

`apps/docs/content/features/formatting.mdx`, "Structured Error Logs" section:

- In the bullet list, change the `cause` bullet to say it reaches transports as `error.cause` (up to three levels) and is not a console branch.
- Change the sentence "If a caught error contains any of these fields, they are automatically extracted and rendered under the `error.` namespace (`error.code`, `error.why`, `error.fix`, `error.link`, `error.internal`, and `error.cause`) as individual tree branches." to list `error.code`, `error.why`, `error.fix`, `error.link` and `error.internal`, then add a paragraph:

> A server error with a stack also gets `error.at`, the first stack frame outside `node_modules`, as `<file>:<line>:<column>` relative to the working directory. It is console only: transports receive the full `stack` instead. A 4xx `HttpError` carries no stack, so it has no `error.at`.

`apps/elysia/demo.tape`: change `Set Height 940` to `Set Height 964` and extend the comment above it with one line saying the extra row holds the `error.at` line under `/boom`.

Create `.changeset/error-at-on-console.md`:

```md
---
'logixlysia': minor
---

The console tree shows where a server error was thrown: `error.at  src/routes/pay.ts:42:11`, the first stack frame outside `node_modules`. Transports are unchanged and still receive the full `stack`.
```

Run `bun run format` at the repo root.

**Verify**: `bun run lint && bun run typecheck` → exit 0.

## Test plan

- Unit: `__tests__/logger/format-output.test.ts` (two updated, three new).
- Plugin: `__tests__/plugin/error-at.test.ts` (three new).
- `cd packages/logixlysia && bun run build && bun test` → all pass.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun run build && bun test` exits 0
- [ ] `grep -n "error.at" packages/logixlysia/src/logger/create-logger.ts` matches
- [ ] `grep -n "Set Height 964" apps/elysia/demo.tape` matches
- [ ] `grep -n "error.cause" apps/docs/content/features/formatting.mdx` no longer lists it as a tree branch
- [ ] `git status --short` lists only in-scope files
- [ ] `.changeset/error-at-on-console.md` exists with `'logixlysia': minor`

## STOP conditions

- The `collectStructuredErrorEntries` excerpt does not match.
- A test outside the two named test files fails because of the new line and the fix would need a file outside scope.
- The frame regex needs a regex literal inside a loop to pass lint.

## Maintenance notes

- The terminal-recording job proves the tape height; if `Wait+Screen /inputTokens/` times out on the PR, raise `Set Height` by one more row (about 24 px).
- Plan 097 changes which records carry `message`; both plans touch the error tree in different files, so whichever lands second just re-runs the suite.
- `relativeToCwd` uses `process.cwd()` at format time; a process that changes directory prints absolute paths, which is correct.
