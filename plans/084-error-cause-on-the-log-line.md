# Plan 084: The error line keeps `cause`, and `HttpError` accepts one

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e27dd76..HEAD -- packages/logixlysia/src/utils/error.ts packages/logixlysia/src/errors.ts packages/logixlysia/__tests__/errors packages/logixlysia/__tests__/logger/handle-http-error.test.ts` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `e27dd76`, 2026-10-30

## Why this matters

`throw new Error('save failed', { cause: dbError })` is the standard way to wrap an error in Node and Bun. The logged error copies only the structured keys (`code`, `fix`, `internal`, `link`, `message`, `name`, `status`, `why`), so the root cause never reaches the error line, which is the one line an operator reads after a failure. `HttpError` cannot carry a cause at all: `HttpErrorInit` has no `cause` and the constructor calls `super(message)` without options. `stringifyForLog` already keeps `cause` on a raw `Error` (`src/utils/json.ts:17-19`), so the file and transport serializers can render it once the normalizer passes it through. `cause` stays out of the HTTP response, like `internal`.

## Current state

- `packages/logixlysia/src/utils/error.ts:53-74`:

```ts
const STRUCTURED_ERROR_KEYS = [
  'code',
  'fix',
  'internal',
  'link',
  'message',
  'name',
  'status',
  'why'
] as const

const copyStructuredErrorFields = (
  record: Record<string, unknown>
): Record<string, unknown> => {
  const safe: Record<string, unknown> = {}
  for (const key of STRUCTURED_ERROR_KEYS) {
    if (record[key] !== undefined) {
      safe[key] = record[key]
    }
  }
  return safe
}
```

`normalizeLoggedError(error, logErrorPayload)` (lines 76-135) handles a `status()` result, a validation error, an `Error` (lines 111-124, where `safe.name` falls back to the constructor name) and a structured plain object.

- `packages/logixlysia/src/errors.ts`: `HttpErrorInit` (lines 11-29: `code`, `fix`, `internal`, `link`, `why`), the constructor (lines 82-117) with `super(message)` at line 83, `toJSON()` (lines 123-132) returning only client-safe fields.
- Tests: `__tests__/errors/http-error.test.ts` (`richError()` helper, `INTERNAL_SECRET` must not leak), `__tests__/logger/handle-http-error.test.ts` (capture transport, asserts `meta.error.*`).
- Docs: `apps/docs/content/api-reference.mdx:308-373` documents `HttpError`, `HttpErrorInit` (line 326) and the field list (line 342 explains `internal`; line 371 says what the log line carries).

## Commands you will need

| Purpose | Command (repo root unless noted) | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint / format / typecheck | `bun run lint`, `bun run format`, `bun run typecheck` | exit 0 |
| Focused | `cd packages/logixlysia && bun test __tests__/errors __tests__/logger` | pass |
| All tests | `cd packages/logixlysia && bun test` | all pass (758 at baseline) |

## Scope

**In scope**:

- `packages/logixlysia/src/utils/error.ts`
- `packages/logixlysia/src/errors.ts`
- `packages/logixlysia/__tests__/errors/http-error.test.ts`, `__tests__/logger/handle-http-error.test.ts`
- `apps/docs/content/api-reference.mdx` (the `HttpError` section only)
- `.changeset/error-cause.md` (create)

**Out of scope**: `src/utils/json.ts`, `src/logger/handle-http-error.ts`, `src/index.ts`, the API snapshot (types are not in it).

## Git workflow

- Branch `improve/084-error-cause` from `e27dd76`.
- Commits: `feat(errors): keep cause on the logged error`, then `feat(errors): accept cause in HttpErrorInit`.
- `git -c commit.gpgsign=false commit …`; no trailers. Do not push.

## Steps

### Step 1: Failing tests

In `handle-http-error.test.ts`: a route that throws `new Error('save failed', { cause: new Error('connection reset') })`; expect the captured error line's `meta.error.cause` to be `{ message: 'connection reset', name: 'Error' }` (the normalized shape), and `meta.error.message` to be `'save failed'`. A second case with a three-deep chain expects depth beyond 3 to be cut (the fourth level absent) so a long chain cannot grow the line without bound. A third case with `cause: 'plain string'` keeps the string.

In `http-error.test.ts`: `new HttpError(502, 'Upstream failed', { cause: inner })` has `error.cause === inner`; `toJSON()` has no `cause` key; `JSON.stringify(error)` does not contain the inner message; `normalizeLoggedError(error, false).error.cause` is the normalized inner error.

**Verify**: all fail on the current code.

### Step 2: Normalize `cause`

In `utils/error.ts`: add `'cause'` to `STRUCTURED_ERROR_KEYS` is not enough, since a cause may itself be an `Error` whose own fields are non-enumerable. Instead, after `copyStructuredErrorFields` in the `Error` branch and the structured-object branch, set `safe.cause = normalizeCause(record.cause, depth)` when `record.cause !== undefined`, where `normalizeCause` returns `normalizeLoggedError(cause, logErrorPayload).error` for an `Error` or structured object (recursing with `depth + 1`, stopping at `MAX_CAUSE_DEPTH = 3` by omitting the field) and the value itself for primitives. Thread `depth` as an internal parameter with a default of 0; the exported signature stays `normalizeLoggedError(error, logErrorPayload)`.

**Verify**: the three `handle-http-error` cases pass; existing tests there still pass.

### Step 3: `HttpErrorInit.cause`

In `errors.ts`: add `cause?: unknown` to `HttpErrorInit` with a one-line doc ("The underlying error, logged with the line and never serialized into the response."); call `super(message, init.cause === undefined ? undefined : { cause: init.cause })`. Leave `toJSON()` unchanged. Update the class doc comment's field sentence to mention `cause` next to `internal`.

**Verify**: `cd packages/logixlysia && bun test __tests__/errors` passes.

### Step 4: Docs, changeset, suite

- `api-reference.mdx`: add `cause?: unknown` to the `HttpErrorInit` listing (line 326 block) and one bullet after the `internal` bullet (line 342): `cause` is log-only too, rendered as `error.cause` with `message`, `name` and the structured fields of the inner error, up to three levels deep.
- `.changeset/error-cause.md`:

```md
---
'logixlysia': minor
---

The error line now carries `error.cause` for an error thrown with `{ cause }`, normalized the same way as the error itself and cut at three levels. `HttpError` accepts `cause` in its init object; like `internal`, it is logged and never serialized into the response.
```

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0; `cd packages/logixlysia && bun test` all pass.

## Test plan

- Three cases in `handle-http-error.test.ts`, one group in `http-error.test.ts` (Step 1).

## Done criteria

- [ ] Lint, typecheck exit 0; suite passes with the new tests
- [ ] `JSON.stringify(new HttpError(500, 'x', { cause: new Error('inner') }))` contains no `inner` (pinned by a test)
- [ ] Docs and changeset present; no files outside scope

## STOP conditions

- The excerpts do not match.
- `autoRedact` tests show `cause` bypasses redaction (it should go through `redact()` with the rest of `data`; if a test proves otherwise, report).
- Bun's `Error` constructor does not accept the options object (it does on Bun 1.3; if typecheck complains, check `lib` in `tsconfig`, do not cast).

## Maintenance notes

- Reviewer: check the depth cut, that `cause` is never in `toJSON()`, and that a circular cause (`a.cause = a`) terminates (the depth cap guarantees it; a test for it is welcome).
