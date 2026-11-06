# Plan 093: Server errors carry their `stack` to transports

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report. A reviewer dispatched you and maintains `plans/README.md`, so do not edit the index.
>
> **Drift check (run first)**: `git diff --stat 0873da0..HEAD -- packages/logixlysia/src/utils/error.ts apps/docs/content/features/transports.mdx`. If a file changed, compare the excerpts below with the live code; a mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (adds a field to a shipped payload)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0873da0`, 2026-11-06

## Why this matters

When a handler throws, Sentry, Axiom and the rest receive `error.name`, `error.message` and `error.cause`, and no stack. Measured: `normalizeLoggedError(new Error('x')).error` has no `stack` key. A logging library whose error line cannot say where the error happened sends people back to their terminal. 4xx errors stay small, because a 404 needs no stack.

## Current state

`packages/logixlysia/src/utils/error.ts`, the `Error` branch of `normalizeLoggedError`:

```ts
if (error instanceof Error) {
  const safe = copyStructuredErrorFields(
    error as unknown as Record<string, unknown>
  )
  safe.message = error.message
  // Native subclasses ...
  safe.name =
    error.name === 'Error'
      ? (error.constructor?.name ?? error.name)
      : error.name
  return {
    error: withCause(safe, error as unknown as Record<string, unknown>),
    message: parseError(error)
  }
}
```

- `copyStructuredErrorFields` copies `code`, `fix`, `internal`, `link`, `message`, `name`, `status`, `why`.
- The console tree picks fields in `src/logger/create-logger.ts:404` `collectStructuredErrorEntries`, which reads named fields, so a stack should not reach the console. The test in Step 2 proves it.
- A redacted record walks this plain object, so with `autoRedact` the stack string passes through `redactString` like any other string.
- `apps/docs/content/features/transports.mdx:55` lists the fields of `meta.error`.

## Commands you will need

| Purpose   | Command                                               | Expected |
| --------- | ----------------------------------------------------- | -------- |
| Install   | `bun install --frozen-lockfile`                       | exit 0   |
| Lint      | `bun run lint`                                        | exit 0   |
| Format    | `bun run format`                                      | exit 0   |
| Typecheck | `bun run typecheck`                                   | exit 0   |
| Tests     | `cd packages/logixlysia && bun run build && bun test` | all pass |

## Scope

**In scope**: `packages/logixlysia/src/utils/error.ts`, `__tests__/errors/*` or `__tests__/logger/*` (add `error-stack.test.ts` under `__tests__/errors/`), any existing test with an exact `toEqual` on `error` for a 500 (add `stack: expect.any(String)`), `apps/docs/content/features/transports.mdx`, `.changeset/error-stack-on-transports.md` (create).

**Out of scope**: `Logger.error`, the console tree, adapter field mapping (Sentry and OTLP exception attributes are a later choice), validation errors and status responses, and `AGENTS.md` (turbo appends a block to it; run `git checkout -- AGENTS.md` before committing and stage by path).

## Git workflow

Branch `improve/093-error-stack` from the worktree HEAD. Conventional commits with no attribution trailer, e.g. `fix(errors): send the stack of a server error to transports`. Do not push.

## Steps

### Step 1: Add the field

Add `const FIRST_SERVER_ERROR_STATUS = 500`. In the `Error` branch, before the return:

```ts
const { status } = error as { status?: unknown }
const isClientError =
  typeof status === 'number' && status < FIRST_SERVER_ERROR_STATUS
if (!isClientError && error.stack !== undefined) {
  safe.stack = error.stack
}
```

The `cause` chain goes through the same function, so each nested error carries its own stack up to the existing three levels.

**Verify**: `bun run typecheck` exits 0.

### Step 2: Tests

Create `__tests__/errors/error-stack.test.ts`:

1. `normalizeLoggedError(new Error('x'), false).error.stack` is a string containing `error-stack.test`.
2. `new HttpError(500, 'x')` has a stack. `new HttpError(404, 'x')` has none. An error with `status: 'weird'` has one.
3. A cause has its own stack.
4. Plugin level: a throwing route with a capture transport gives `meta.error.stack` a string, and a route throwing `HttpError(404)` has none.
5. With a console spy (`__tests__/_helpers/console.ts`) and a throwing route, nothing written to the console contains the stack's `at ` frame lines.
6. With `autoRedact: true`, an error message holding an email has the email masked in `meta.error.stack` too.

Run the file logging path once by hand or in a test: with `logFilePath` in a temp dir (`__tests__/_helpers/tmp.ts`), read what a throwing route writes and record whether a stack appears. If it does, keep it only if the file line stays a single line. Otherwise this is a STOP condition.

**Verify**: `cd packages/logixlysia && bun test __tests__/errors` passes, and cases 1, 2 and 4 fail with Step 1 reverted (check once, then restore).

### Step 3: Fix exact-match tests

Run the whole suite. For a test that compares `error` exactly on a server error, add `stack: expect.any(String)`. Change nothing else in those tests.

**Verify**: `cd packages/logixlysia && bun run build && bun test` passes.

### Step 4: Docs and changeset

In `transports.mdx:55`, add: "`stack` for an error that is not a 4xx". Create `.changeset/error-stack-on-transports.md` with `'logixlysia': patch`: error lines sent to transports now include `error.stack` for server errors.

**Verify**: `bun run format`, then `bun run lint` exits 0.

## Test plan

Step 2. Existing suites stay green after Step 3.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0.
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the new tests.
- [ ] `git status` shows only in-scope files; `AGENTS.md` is unchanged.

## STOP conditions

- A stack reaches the console, or breaks a file line across several lines.
- More than ten existing tests need the Step 3 edit, which means the payload is pinned more widely than this plan assumed.

## Maintenance notes

Adapters flatten `meta`, so a stack arrives as `error.stack` on flat backends and may hit per-attribute size limits there. A later plan can map it to each backend's exception field.
