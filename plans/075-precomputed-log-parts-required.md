# Plan 075: `precomputed` log parts become required, so the three duplicate URL and duration fallbacks go away

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. Do not update `plans/README.md`; your reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 5115bea..HEAD -- packages/logixlysia/src/logger/emit.ts packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/src/output/file.ts packages/logixlysia/src/output/index.ts packages/logixlysia/__tests__/output packages/logixlysia/__tests__/logger/format-output.test.ts`
> must print nothing. If the excerpts under "Current state" do not match the
> live file, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (behaviour-preserving for every production path; the only visible change is that a malformed URL renders the same everywhere)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `5115bea`, 2026-10-30

## Why this matters

`emit()` computes the request's `pathname`, `search` and `durationMs` once (`computePrecomputedLogParts`) and passes them to the three sinks: console (`formatLogOutput`), file (`logToFile`) and transports (`logToTransports`). Each sink still accepts `precomputed` as optional and keeps a fallback that parses `request.url` again or recomputes the duration. Production never takes those fallbacks. Only the 51 direct unit-test calls do, so the tests exercise code production does not run, and the three fallbacks have already drifted: a malformed URL renders as the raw string in `file.ts`, as `request.url || '/'` in `emit.ts`, and as a sanitized string in `create-logger.ts`.

Making `precomputed` required deletes the fallbacks, leaves one URL parser (`parseRequestUrlOnce`), and makes the unit tests drive the same path production does. Subtract first; nothing is added except a test helper.

## Current state

`packages/logixlysia/src/logger/emit.ts`:

- `:19` `import type { FormatContext, PrecomputedLogParts } from './create-logger'`
- `:67-76`:

  ```ts
  export const parseRequestUrlOnce = (
    request: RequestInfo
  ): { pathname: string; search: string } => {
    try {
      const { pathname, search } = new URL(request.url)
      return { pathname, search }
    } catch {
      return { pathname: request.url || '/', search: '' }
    }
  }
  ```

- `:78-90` `computePrecomputedLogParts(store, request, needsUrlParts, durationOverride)` returns `{ durationMs, pathname, search }`, with empty strings when `needsUrlParts` is false.
- `:160-210`: computes `precomputed` once and passes it to `logToTransports`, `logToFile` and `formatLogOutput` on every call.

`packages/logixlysia/src/output/file.ts`:

- `:1-5` imports `elapsedMs` from `../utils/duration` and `sanitizeLogText` from `../utils/sanitize`.
- `:21` `precomputed?: { durationMs: number; pathname: string; search: string }` in `LogToFileInput`.
- `:26-41`:

  ```ts
  const resolvePathname = (
    request: RequestInfo,
    logQueryParams: boolean | undefined,
    precomputed?: { pathname: string; search: string }
  ): string => {
    if (precomputed) {
      const { pathname, search } = precomputed
      return logQueryParams ? `${pathname}${search}` : pathname
    }
    try {
      const { pathname, search } = new URL(request.url)
      return logQueryParams ? `${pathname}${search}` : pathname
    } catch {
      return request.url
    }
  }
  ```

- `:53` `const durationMs = precomputed?.durationMs ?? elapsedMs(store.beforeTime)`
- `:55-56` builds the line with `sanitizeLogText(pathname, 1024)`.

`packages/logixlysia/src/output/index.ts`:

- `:8` imports `elapsedMs`.
- `:44-51` `LogToTransportsInput` with `precomputed?: {...}`.
- `:68` `durationMs: precomputed?.durationMs ?? elapsedMs(store.beforeTime)`.

`packages/logixlysia/src/logger/create-logger.ts`:

- `PrecomputedLogParts` is exported from this file (find its declaration with `grep -n "PrecomputedLogParts" src/logger/create-logger.ts`).
- `:506-530` `getPathnameTokens(tokens, request, config, useColors, precomputed?)`:

  ```ts
    let rawPathname: string
    let search: string
    if (precomputed) {
      ;({ pathname: rawPathname, search } = precomputed)
    } else {
      try {
        ;({ pathname: rawPathname, search } = new URL(request.url))
      } catch {
        rawPathname = sanitizeLogText(request.url || '/', 1024)
        search = ''
      }
    }
  ```

- `:592-615` `getDurationTokens(..., precomputed?)` with `const durationMs = precomputed?.durationMs ?? elapsedMs(store.beforeTime)` at `:606`.
- `:636-700` `formatLogOutput({ level, request, data, store, options, formatContext, precomputed })` with `precomputed?: PrecomputedLogParts` at `:651`, passing it to `getPathnameTokens` (`:674`) and `getDurationTokens` (`:691`).

Direct test callers that must now pass `precomputed` (counts of `logToFile(`/`logToTransports(`/`formatLogOutput(` calls): `__tests__/output/file.test.ts` 17, `__tests__/output/transports.test.ts` 9, `__tests__/output/race-condition.test.ts` 3, `__tests__/output/interval-rotation.test.ts` 11, `__tests__/logger/format-output.test.ts` 11. A typical call, `file.test.ts:20-27`:

```ts
      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/test'),
        store: { beforeTime: 0n }
      })
```

`__tests__/_helpers/` holds small shared helpers (`request.ts`, `sleep.ts`, `tmp.ts`, ...), one export each.

## Commands you will need

Run from the worktree root unless the row says otherwise. A fresh worktree has no `node_modules`; install first.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0, lockfile unchanged (`git status --short bun.lock` prints nothing) |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 (run before every commit) |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests (package) | `cd packages/logixlysia && bun test` | `0 fail`; 723 tests pass at the planned-at commit, plus the ones this plan adds |
| One test file | `cd packages/logixlysia && bun test __tests__/<area>/<file>.test.ts` | `0 fail` |
| Build | `bun run build` | exit 0, `packages/logixlysia/dist/` has 14 entries |

Notes that save time:

- `turbo` (used by `bun run typecheck`, `bun run build`, `bun run test` at the root) appends an "agent rules" block to `AGENTS.md` when it runs. Never commit that block. After any turbo run, `git checkout -- AGENTS.md` unless this plan tells you to edit `AGENTS.md` (then revert only the appended block).
- Lint is Ultracite (oxlint + oxfmt) with strict rules. Never add a disable comment, an ignore entry, or loosen a rule. Restructure the code until it passes. `bun run format` fixes formatting only.
- Tests use `bun:test` (`describe`, `test`, `expect`). Assert what a caller observes (a returned value, a written line, a transport call, a thrown error), not internals. Derive the expected value from the requirement, not from running the code.
- Comments: write none that narrate the code or the step. Keep a comment only for a non-obvious reason the code cannot show.

## Git workflow

- Start from commit `5115bea` (`origin/main`). In your worktree: `git checkout -B improve/<NNN>-<slug> 5115bea`. Do not branch from the worktree's initial HEAD, which is an unrelated docs branch.
- Conventional Commits, one commit per logical unit, in the order the steps are listed: `fix(<area>): <imperative subject>`, body explains why in two to four plain sentences. No `Co-Authored-By` or any attribution trailer. No "Generated with" line.
- Commit with signing off, per command: `git -c commit.gpgsign=false commit -m ...`. The session cannot reach the repository's signer.
- Every change under `packages/logixlysia/` needs a changeset unless this plan says otherwise: `.changeset/<slug>.md` containing

  ```
  ---
  'logixlysia': patch
  ---

  <one or two sentences, user-facing, past tense: what was wrong and what the user sees now>
  ```

  Commit the changeset together with the fix it describes.
- Do not push, do not open a PR, do not touch `plans/`. Your reviewer maintains the index and does the delivery.


## Scope

**In scope** (the only files you may modify):

- `packages/logixlysia/src/logger/emit.ts` (only `parseRequestUrlOnce`'s fallback, Step 1)
- `packages/logixlysia/src/logger/create-logger.ts`
- `packages/logixlysia/src/output/file.ts`
- `packages/logixlysia/src/output/index.ts`
- `packages/logixlysia/__tests__/_helpers/precomputed.ts` (create)
- `packages/logixlysia/__tests__/output/file.test.ts`, `transports.test.ts`, `race-condition.test.ts`, `interval-rotation.test.ts`
- `packages/logixlysia/__tests__/logger/format-output.test.ts`
- `.changeset/precomputed-log-parts-required.md` (create)

**Out of scope**: `src/output/file-sink.ts` (plan 074), `src/index.ts`, `src/utils/*`, the API snapshot (`logToFile`, `logToTransports`, `formatLogOutput` are not package exports; if `__tests__/api` fails, STOP), `__tests__/output/file-sink-lifecycle.test.ts` (plan 074), `__tests__/plugin/*`.

## Steps

### Step 1: One fallback for a malformed URL

In `parseRequestUrlOnce`, make the `catch` return `{ pathname: sanitizeLogText(request.url || '/', 1024), search: '' }` (import `sanitizeLogText` from `../utils/sanitize`). This is the behaviour the console path had; the file path sanitizes again at output, which is harmless.

**Verify**: `cd packages/logixlysia && bun test __tests__/logger` → `0 fail`.

Commit: `fix(logger): sanitize a malformed request URL in the one URL parser`.

### Step 2: Add the test helper

Create `__tests__/_helpers/precomputed.ts`:

```ts
import { parseRequestUrlOnce } from '../../src/logger/emit'
import type { PrecomputedLogParts } from '../../src/logger/create-logger'
import type { RequestInfo } from '../../src/interfaces'

export const precomputedFor = (
  request: RequestInfo,
  durationMs = 0
): PrecomputedLogParts => ({ durationMs, ...parseRequestUrlOnce(request) })
```

(Adjust the type import path if `RequestInfo` lives elsewhere; `grep -rn "export type RequestInfo" src`.)

### Step 3: Make `precomputed` required and delete the fallbacks

- `output/file.ts`: `precomputed: PrecomputedLogParts` (import the type from `../logger/create-logger` with `import type`); `resolvePathname` becomes a two-line function over `precomputed` and `logQueryParams` (or inline it); `durationMs = precomputed.durationMs`; remove the `elapsedMs` import if unused.
- `output/index.ts`: same type, `durationMs: precomputed.durationMs`, remove `elapsedMs` import if unused.
- `logger/create-logger.ts`: `precomputed: PrecomputedLogParts` in `getPathnameTokens`, `getDurationTokens` and `formatLogOutput`; delete the `else` branch in `getPathnameTokens` and the `??` in `getDurationTokens`; remove imports that become unused (`elapsedMs`, maybe `sanitizeLogText` if nothing else in the file uses it; check with grep before removing).
- `logger/emit.ts` needs no change beyond Step 1; it already passes `precomputed`.

Typecheck will now list every test call missing `precomputed`.

**Verify**: `bun run typecheck` fails only inside the five test files listed in scope (read the error list; any error in `src/` means a production caller was missed, which is a STOP).

### Step 4: Update the direct test calls

In each of the five test files, add `precomputed: precomputedFor(request)` to every direct call, binding the request to a `const` first when it is inline. Where a test asserts the duration shown in the line (search each file for `ms` expectations and `beforeTime`), pass the duration explicitly: `precomputedFor(request, 12.34)` and assert `12.34ms`; the `store.beforeTime` input stays because the input type still requires `store`. Where a test asserts query-param handling (`logQueryParams`), nothing else changes, since `precomputedFor` parses the same URL.

**Verify**: `bun run typecheck` exits 0. `cd packages/logixlysia && bun test __tests__/output __tests__/logger` → `0 fail`.

Commit Steps 2 to 4 as one: `refactor(logger): require precomputed log parts and drop the per-sink URL fallbacks`.

### Step 5: Changeset, full gates

Create `.changeset/precomputed-log-parts-required.md` (`'logixlysia': patch`): a request whose URL cannot be parsed now renders the same sanitized path on the console and in the log file; no other visible change.

**Verify**: `bun run format && bun run lint && bun run typecheck && (cd packages/logixlysia && bun test)` → all exit 0, `0 fail`. `grep -rn "new URL(request.url)" src` → only `src/logger/emit.ts` (and any site outside the four files in scope, which you leave alone). `grep -rn "precomputed?" src` → nothing.

## Test plan

No new behaviour tests beyond the existing ones now running through the production path. Add exactly one: in `__tests__/output/file.test.ts`, a request with a malformed URL containing a control character (`createMockRequest('not a url\u001b[31m')`, or however the mock accepts a raw string) writes a line whose path has the control character removed. If the mock request helper rejects an invalid URL, build a minimal `{ method: 'GET', url: '...', headers: new Headers() } as RequestInfo` instead.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun test` → `0 fail`, at least 724 tests
- [ ] `grep -rn "precomputed?" packages/logixlysia/src` → no matches
- [ ] `grep -rn "new URL(request.url)" packages/logixlysia/src/output packages/logixlysia/src/logger/create-logger.ts` → no matches
- [ ] `grep -rn "elapsedMs" packages/logixlysia/src/output/file.ts packages/logixlysia/src/output/index.ts packages/logixlysia/src/logger/create-logger.ts` → no matches (if one remains, it must have another caller; say so in NOTES)
- [ ] `git diff --stat 5115bea..HEAD` lists only in-scope paths

## STOP conditions

- The excerpts do not match the live file.
- Typecheck after Step 3 reports an error in `src/` (a production caller without `precomputed` exists).
- A test in scope asserts a duration computed from `store.beforeTime` that cannot be expressed by passing `durationMs` (report the test).
- The `__tests__/api` snapshot changes.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- `computePrecomputedLogParts` returns empty `pathname`/`search` when no sink needs URL parts (`needsUrlParts` false); the sinks already tolerate that because they only read those fields for tokens that need them. Reviewer: confirm the file line does not print an empty path when file logging is on (`needsUrlParts` must be true whenever `hasFileLogging` is; check `resolveSinks` in `emit.ts`).
- `precomputedFor` deliberately reuses the production parser; if the parser ever gains options, the helper follows.
