# Plan 097: Every logged error record carries `message`, and a thrown plain object logs its own fields

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 91fd02f..HEAD -- packages/logixlysia/src/utils/error.ts packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/__tests__/plugin/log-error.test.ts packages/logixlysia/__tests__/logger/handle-http-error.test.ts apps/docs/content/features/request-context.mdx apps/docs/content/features/transports.mdx` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `91fd02f`, 2026-11-08

## Why this matters

A handler that does `throw { code: 'PAYMENT_DECLINED', detail: 'issuer timeout' }`, or `log.error({ reason: 'x' })` since plan 095 made `log.error` take `unknown`, logs the message `[object Object]` and keeps only the keys `normalizeLoggedError` knows (`code`, `why`, `fix`, `link`, `internal`), so `detail` is lost on every sink. The console tree is worse: `collectStructuredErrorEntries` prints `error  [object Object]` for every error record that has no `message`, which includes every 422 validation line, `throw 'just a string'`, `throw 42` and arrays. The `dev` preset turns the tree on, so a developer sees `error  [object Object]` under each validation failure.

The fix is one invariant: every record `normalizeLoggedError` returns carries a string `message`. A plain object (prototype `Object.prototype` or `null`) is logged as its own fields plus that `message`, which keeps key-based redaction working on it (redaction runs on the whole record in `writeRecord`, after normalization). Measured on Bun 1.3.14 with Elysia 1.4.30, both `aot: true` and `aot: false`: Elysia hands `onError` the thrown object unwrapped, and with `aot: true` it also sends that object to the client as the JSON body, so the docs must steer people to `HttpError`.

## Current state

- `packages/logixlysia/src/utils/error.ts` — builds the `error` record and `message` for every error line. `parseError` (lines 7-15):

```ts
export const parseError = (error: unknown): string => {
  if (error instanceof Error) {
    return toText(error.message)
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return toText(error.message)
  }
  return String(error)
}
```

`normalizeLoggedError` (lines 84-177). The validation branch returns a record without `message`:

```ts
return {
  error: { failedPaths: paths, name: 'ValidationError', type: scope },
  message
}
```

The structured branch (objects with `why`, `fix`, `link`, `code` or `internal`, Error or not) keeps only `STRUCTURED_ERROR_KEYS`:

```ts
if (isStructuredError(error)) {
  return {
    error: withCause(
      copyStructuredErrorFields(error as Record<string, unknown>),
      error as Record<string, unknown>
    ),
    message: parseError(error)
  }
}

return { error: { value: String(error) }, message: parseError(error) }
```

The `Error` branch already sets `safe.message = error.message`.

- `packages/logixlysia/src/logger/create-logger.ts` lines 456-480, `collectStructuredErrorEntries(error)`, calls `parseError(error)` on the normalized record and pushes `['error', ...]`. Do not change this file: once every record has `message`, it prints the right text.
- Measured output today (probe through `app.handle`, capture transport, console spy): `throw { code: 'X', detail: 'secret-ish', password: 'hunter2' }` gives the transport `{ level: 'ERROR', message: '[object Object]', error: { code: 'X' }, status: 500 }` and the console `GET /structured 500 … [object Object]` with the tree `├─ error  [object Object]` and `└─ error.code  X`. `throw { foo: 1 }` gives `error: { value: '[object Object]' }`. `throw 'just a string'` gives the main line `just a string` and the tree `└─ error  [object Object]`.
- Conventions: tests in `packages/logixlysia/__tests__/<area>/*.test.ts` with `bun:test`; drive the plugin through `new Elysia().use(logixlysia({...})).get(...)` and `app.handle(new Request(...))`; capture sinks with a `transports: [{ log }]` mock; capture the console with `spyConsole` from `__tests__/_helpers/console.ts`. Model new tests after `__tests__/plugin/log-error.test.ts` (its `build()` helper) and `__tests__/logger/handle-http-error.test.ts`.
- Lint is Ultracite (oxlint + oxfmt). Never add ignore comments or change lint config; restructure code instead. Comments explain only a non-obvious why.
- Every change under `packages/logixlysia/` needs a changeset file `.changeset/<slug>.md`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install (fresh worktree) | `bun install --frozen-lockfile` | exit 0 |
| Lint + format check | `bun run lint` (repo root) | exit 0 |
| Format | `bun run format` (repo root) | exit 0 |
| Typecheck | `bun run typecheck` (repo root) | exit 0 |
| Build + tests | `cd packages/logixlysia && bun run build && bun test` | all pass |
| One test file | `cd packages/logixlysia && bun test __tests__/plugin/log-error.test.ts` | all pass |

Running a turbo task can append a `turborepo-agent-rules` block to `AGENTS.md`. Run `git checkout -- AGENTS.md` before every commit and stage files by path.

## Scope

**In scope** (the only files you should modify):

- `packages/logixlysia/src/utils/error.ts`
- `packages/logixlysia/__tests__/plugin/log-error.test.ts`
- `packages/logixlysia/__tests__/logger/handle-http-error.test.ts`
- `apps/docs/content/features/request-context.mdx`
- `apps/docs/content/features/transports.mdx`
- `.changeset/plain-object-error-record.md` (create)

**Out of scope** (do NOT touch):

- `packages/logixlysia/src/logger/create-logger.ts` — the tree reads `message` from the record; it needs no change.
- `packages/logixlysia/src/utils/redact.ts` — redaction already walks plain objects.
- `HttpError` and its response shape.

## Git workflow

- Branch from `91fd02f`: `improve/097-plain-object-error-record`.
- Conventional commits, no trailer, body says why. Example from history: `feat(plugin): let log.error take a caught error` with a body explaining what a catch block saw before.
- Two commits: `fix(errors): log a thrown plain object with its fields and a message`, then `docs(context): say how a plain object is logged`.
- Do not push or open a PR; the reviewer does that.

## Steps

### Step 1: Give every record a `message` and add the plain-object branch

In `packages/logixlysia/src/utils/error.ts`:

1. Add a local helper (no import; the one in `context/request-context.ts` is not exported):

```ts
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const NON_ERROR_OBJECT_MESSAGE = 'Non-Error object'
```

2. Change `parseError` so an object (not an array) without a string `message` returns `NON_ERROR_OBJECT_MESSAGE`. Arrays and primitives keep `String(error)`. Keep `toText(error.message)` for an object whose `message` is a string.

3. In `normalizeLoggedError`, add `message` to the validation record (`{ failedPaths, message, name: 'ValidationError', type: scope }`).

4. Insert a plain-object branch after the `error instanceof Error` branch and before `isStructuredError`:

```ts
if (isPlainObject(error)) {
  const message = parseError(error)
  const record: Record<string, unknown> = { ...error, message }
  return { error: withCause(record, error), message }
}
```

`{ ...error }` copies own enumerable fields, so `detail` survives and `__proto__` stays a plain key. `withCause` still normalizes `record.cause`.

5. In the remaining structured branch (class instances that are not `Error`), set `message` on the copied record: build `const safe = copyStructuredErrorFields(...)`, then `safe.message = parseError(error)` before `withCause`.

6. Change the fallthrough to `{ error: { message, value: String(error) }, message }` where `message = parseError(error)`. Keep `value` so nothing that reads it changes.

**Verify**: `cd packages/logixlysia && bun test __tests__/plugin __tests__/logger __tests__/errors` → all pass (one existing test, "a non-Error value does not throw and writes one line", still passes; you tighten it in step 2).

### Step 2: Tests

In `packages/logixlysia/__tests__/logger/handle-http-error.test.ts`, add tests (inside `describe('handleHttpError')` or a new `describe('non-Error values')`), each through `app.handle` with the capture transport and `disableFileLogging: true`:

1. `throw { code: 'X', detail: 'd', password: 'hunter2' }` with `autoRedact: true, disableInternalLogger: true` → the event has `level 'ERROR'`, `message 'Non-Error object'`, `meta.status 500`, `meta.error` equal to `{ code: 'X', detail: 'd', message: 'Non-Error object', password: '[REDACTED]' }`, and `JSON.stringify(events)` does not contain `hunter2`.
2. `throw { message: 'boom', code: 'X' }` → `message 'boom'` and `meta.error.code 'X'`.
3. The 422 console tree: build the login app with the internal logger on (`disableInternalLogger` absent) and `useColors: false`, wrap in `spyConsole(['error', 'warn'])`, post an invalid body, join every console call's first argument, and assert it contains `error  Validation failed (body)` and does not contain `[object Object]`. Restore the spies in `finally`.
4. `throw 'boom'` with the console on → the joined console text contains `error  boom` and not `[object Object]`.
5. `throw ['a', 'b']` → transport `message 'a,b'` and `meta.error.message 'a,b'`.

In `packages/logixlysia/__tests__/plugin/log-error.test.ts`, change the last test to assert `events[0]?.message` is `'Non-Error object'` and `events[0]?.meta.error` matches `{ message: 'Non-Error object', reason: 'x' }`, and add one test: `log.error({ message: 'db down', retries: 3 })` → `message 'db down'`, `meta.error.retries 3`.

Check each new assertion fails against the unfixed source once (`git stash` the source change, run the file, `git stash pop`), and report which did.

**Verify**: `cd packages/logixlysia && bun run build && bun test` → all pass.

### Step 3: Docs and changeset

In `apps/docs/content/features/request-context.mdx`, after the paragraph "The line carries no status, because the handler may recover and respond with a 200." (around line 94), add:

> A plain object, thrown or passed to `log.error`, is logged with its own fields. Its `message` field is the line's message when it is a string; otherwise the message is `Non-Error object`. Prefer `HttpError`: with `aot: true` Elysia sends a thrown plain object to the client as the JSON body, every field included.

In `apps/docs/content/features/transports.mdx`, in the paragraph starting "`meta` always carries" (around line 56), after the sentence ending "unless the error's own `status` is below 500.", add: "A thrown plain object arrives with its own fields plus `message`; a thrown string or number arrives as `{ message, value }`."

Create `.changeset/plain-object-error-record.md`:

```md
---
'logixlysia': patch
---

A thrown or logged plain object is logged with its own fields and a `message`, instead of `[object Object]` and only its `code`, `why`, `fix`, `link` and `internal`. The console tree no longer prints `error  [object Object]` under a validation failure or a thrown string.
```

Run `bun run format` at the repo root, then `bun run lint`.

**Verify**: `bun run lint && bun run typecheck` → exit 0.

## Test plan

- New tests in `__tests__/logger/handle-http-error.test.ts`: plain object with redaction, plain object with `message`, 422 tree text, thrown string tree text, thrown array.
- Changed and new tests in `__tests__/plugin/log-error.test.ts`: `log.error` with a plain object, with and without `message`.
- Pattern: the files' existing tests.
- `cd packages/logixlysia && bun run build && bun test` → all pass, at least 6 new tests.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0 at the repo root
- [ ] `cd packages/logixlysia && bun run build && bun test` exits 0
- [ ] `grep -n "Non-Error object" packages/logixlysia/src/utils/error.ts` matches
- [ ] The five new handle-http-error tests and the two log-error tests exist and pass
- [ ] `git status --short` lists only in-scope files
- [ ] `.changeset/plain-object-error-record.md` exists with `'logixlysia': patch`

## STOP conditions

- The excerpts above do not match `src/utils/error.ts`.
- A test outside the two named test files fails after step 1 and the failure is not the `[object Object]` text changing.
- The fix seems to need a change in `create-logger.ts` or `redact.ts`.

## Maintenance notes

- `normalizeLoggedError` now promises a string `message` on every record; `collectStructuredErrorEntries` relies on it. A new branch must set it.
- Arrays of objects still print `[object Object],[object Object]` via `String(value)`; accepted as rare.
- `throw undefined` crashes Elysia's own compose with a TypeError before the plugin sees it; out of scope.
