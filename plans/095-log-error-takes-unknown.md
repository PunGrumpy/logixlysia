# Plan 095: `catch (err) { log.error(err) }` compiles and logs the error

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report. A reviewer dispatched you and maintains `plans/README.md`, so do not edit the index.
>
> **Drift check (run first)**: `git diff --stat 0873da0..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/src/types/logger.ts`. Plan 091 changes `types/logger.ts` to `DeepPartial<TFields>`; anything else that does not match the excerpts is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/091-deep-merge-context.md`
- **Category**: direction
- **Planned at**: commit `0873da0`, 2026-11-06

## Why this matters

The most common line in any handler is a type error here, because `err` in a `catch` is `unknown` and `log.error` takes a `string`. Anyone who casts it past the compiler gets a blank message: measured, a transport receives `message: ''` and `meta.message` serialized to `{}`. The serialization that handles this already exists for thrown errors.

## Current state

`packages/logixlysia/src/types/logger.ts`, in `RequestScopedLogger`, after plan 091:

```ts
error: (message: string, context?: DeepPartial<TFields>) => void
```

`packages/logixlysia/src/index.ts`, starting around line 369:

```ts
const emitCustomLog = (
  level: LogLevel,
  request: Request,
  message: string,
  context?: Record<string, unknown>
): void => {
  if (isSuppressed(sinks, level, logFilter)) {
    return
  }
  ...
  const outcome = baseLogger.log(
    level,
    request,
    { context, message },
    { beforeTime: record.startedAt }
  )
```

and around line 431, in `createRequestScopedLogger`:

```ts
error: (message, context) =>
  emitCustomLog('ERROR', request, message, context),
```

`src/utils/error.ts` exports `normalizeLoggedError(error, logErrorPayload)`, returning `{ error: Record<string, unknown>, message: string }`. It handles `Error`, `HttpError` fields, `cause` and validation errors. `handleHttpError` calls it with `config?.logErrorPayload === true`.

`src/context/storage.ts` `noopRequestLogger.error` is `discard`, which already fits the wider type. `Logger.error(request, message, context)` is not changed: a non-string is already a type error there, and the first argument position differs.

## Commands you will need

| Purpose   | Command                                               | Expected |
| --------- | ----------------------------------------------------- | -------- |
| Install   | `bun install --frozen-lockfile`                       | exit 0   |
| Lint      | `bun run lint`                                        | exit 0   |
| Format    | `bun run format`                                      | exit 0   |
| Typecheck | `bun run typecheck`                                   | exit 0   |
| Tests     | `cd packages/logixlysia && bun run build && bun test` | all pass |

## Scope

**In scope**: `packages/logixlysia/src/index.ts`, `src/types/logger.ts`, `__tests__/plugin/log-error.test.ts` (create), `__tests__/types/typed-fields.test.ts`, `apps/docs/content/features/request-context.mdx`, `.changeset/log-error-takes-unknown.md` (create).

**Out of scope**: `Logger.error`, inventing a `status` on the line (a plain `Error` caught and recovered from would falsely claim 500), changing that a custom line replaces the access line, deduplicating `log.error(err); throw err`, which writes two lines as a string message does today, and `AGENTS.md` (turbo appends a block to it; run `git checkout -- AGENTS.md` before committing and stage by path).

## Git workflow

Branch `improve/095-log-error-unknown` from the worktree HEAD. Conventional commits with no attribution trailer, e.g. `feat(plugin): let log.error take a caught error`. Do not push.

## Steps

### Step 1: Implementation

In `types/logger.ts`:

```ts
/**
 * Logs at `ERROR`. Pass a message, or whatever you caught: a non-string is
 * serialized like a thrown error, with its name, `HttpError` fields and cause.
 * Like any custom line, it stands in for the access line and carries no status.
 */
error: (error: unknown, context?: DeepPartial<TFields>) => void
```

In `index.ts`, add an optional fifth parameter `error?: Record<string, unknown>` to `emitCustomLog`, and pass `error === undefined ? { context, message } : { context, error, message }` as the data. Then:

```ts
error: (error, context) => {
  if (typeof error === 'string') {
    emitCustomLog('ERROR', request, error, context)
    return
  }
  const normalized = normalizeLoggedError(error, options.config?.logErrorPayload === true)
  emitCustomLog('ERROR', request, normalized.message, context, normalized.error)
},
```

Import `normalizeLoggedError` from `./utils/error`. Keep the `store.logger` wrapper's `error` as it is. If the context cast does not compile against `DeepPartial`, follow how `debug` and `info` pass theirs.

**Verify**: `bun run typecheck` exits 0.

### Step 2: Tests

Create `__tests__/plugin/log-error.test.ts` with a capture transport, modelled on `__tests__/plugin/logixlysia.test.ts`:

1. `log.error('plain')` behaves as before: `message` is `plain` and `meta.error` is undefined.
2. `log.error(new Error('db down', { cause: new Error('ECONNRESET') }), { step: 'pay' })` gives the transport `message: 'db down'`, `meta.error.name: 'Error'`, `meta.error.cause.message: 'ECONNRESET'`, `meta.context.step: 'pay'`.
3. `new HttpError(402, 'declined', { code: 'X', why: 'y', internal: { a: 1 } })` carries `code`, `why` and `internal`.
4. A recovered error: a route catches, logs, and returns 200. The response is 200, one line is written, and `meta.status` is undefined.
5. `autoRedact: true`: an email in the error message is masked in `message` and `meta.error.message`.
6. `log.error('x')` from `runJob` and from `useLogger()` works; `log.error(new Error('y'))` there carries `meta.error`.
7. A non-`Error` value, `log.error({ reason: 'x' })`, does not throw and writes one line.

In `__tests__/types/typed-fields.test.ts`, add: `try {} catch (err) { log.error(err) }` compiles, and `log.error(err, { cartId: 'a' })` type-checks while `{ nope: 1 }` is a `@ts-expect-error`.

**Verify**: `cd packages/logixlysia && bun test __tests__/plugin/log-error.test.ts` passes and `bun run typecheck` exits 0.

### Step 3: Docs and changeset

In `features/request-context.mdx`, add a short example of `catch (err) { log.error(err, { step: 'payment' }) }`, and say the line carries no status because the handler may recover. Create `.changeset/log-error-takes-unknown.md` with `'logixlysia': minor`.

**Verify**: `bun run format`, then `bun run lint` exits 0.

## Test plan

Step 2. Existing suites stay green.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0.
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the new tests.
- [ ] `git status` shows only in-scope files; `AGENTS.md` is unchanged.

## STOP conditions

- `meta.error` passes through something that drops or stringifies it, so case 2 cannot pass without touching `src/logger/*`.
- Widening the parameter breaks an existing assignment of a `RequestScopedLogger` in the repo.

## Maintenance notes

`Logger.error` and `RequestScopedLogger.error` now differ on purpose. If a later major unifies them, `Logger.error` should take `unknown` too.
