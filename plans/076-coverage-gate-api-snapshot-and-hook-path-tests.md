# Plan 076: Verification gates that can fail, and tests for the hook-path status line and the store logger levels

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. Do not update `plans/README.md`; your reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 5115bea..HEAD -- packages/logixlysia/bunfig.toml packages/logixlysia/__tests__/api/surface.test.ts packages/logixlysia/__tests__/plugin AGENTS.md`
> must print nothing. If the excerpts under "Current state" do not match the
> live file, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (tests and tooling only; no library code changes)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `5115bea`, 2026-10-30

## Why this matters

Two gates cannot fire. The coverage threshold is `lines 0.51, functions 0.48` while actual coverage is 98.1% lines and 99.0% functions (lowest file: `src/helpers/status.ts` at 83.6% lines, `src/output/file.ts` at 75% functions), so a 40-point regression passes. The published-API snapshot test returns early with zero assertions when `dist/index.js` is missing, which is every run of the documented `cd packages/logixlysia && bun test` on a fresh checkout, so a dropped export passes locally and `--update-snapshots` updates nothing.

Two request paths have no behaviour test. `resolveHandledStatus` (the status that goes on the access line when the plugin runs on Elysia's hook path, `aot: false` or inside `group()`/`guard()`) has three uncovered exits: a `status()` result, a non-200 returned `Response`, and an assigned `set.status`. Today they are correct (probed by hand: 404 logs WARNING 404, a 201 `Response` logs 201, `set.status = 418` logs 418, `set.status = 'Created'` logs 201), and a regression would log every one as 200. And `store.logger.debug`/`warn` are never called in tests, so a copy-paste slip in the four near-identical wrappers would go unseen.

## Current state

`packages/logixlysia/bunfig.toml`:

```toml
[test]
coverage = true
# Build config that the API-surface test imports, not library code.
coveragePathIgnorePatterns = ["bunup.config.ts"]
coverageSkipTestFiles = true
coverageThreshold = { lines = 0.51, functions = 0.48 }
```

`packages/logixlysia/__tests__/api/surface.test.ts:7-8` and `:54-60`:

```ts
const packageRoot = path.join(import.meta.dir, '..', '..')
const distReady = existsSync(path.join(packageRoot, 'dist', 'index.js'))
...
describe('published API surface', () => {
  test('every exports subpath resolves and its named exports match the snapshot', () => {
    if (!distReady) {
      return
    }

    expect(resolveSurface()).toMatchSnapshot()
```

`packages/logixlysia/src/index.ts:58-77`:

```ts
const resolveHandledStatus = (
  setStatus: unknown,
  response: unknown
): number => {
  if (isStatusResponse(response)) {
    return response.code
  }

  if (response instanceof Response && response.status !== DEFAULT_STATUS) {
    return response.status
  }

  if (setStatus === undefined || setStatus === null) {
    return DEFAULT_STATUS
  }

  return getStatusCode(setStatus)
}
```

`src/helpers/status.ts:78-90` `levelForStatus(status)` returns `'ERROR'` for 5xx, `'WARNING'` for 4xx, `'INFO'` otherwise (read it to confirm before writing expectations). `src/index.ts:370-402` defines `store.logger.debug/error/info/warn` each calling `emitCustomLog(<LEVEL>, request, message, context)` with `'DEBUG'`, `'ERROR'`, `'INFO'`, `'WARNING'`.

Test exemplars:

- `__tests__/plugin/final-line.test.ts:1-55`: `createCaptureTransport(config)` returns `{ options, transport }` with a mock transport and file/console disabled; `recordAt(transport, i)` returns `{ level, meta }` where `meta.status` is the logged status; `run(app, path)` handles a request and sleeps 30 ms. Its test at `:211-230` uses `new Elysia({ aot: false })` on the hook path.
- `__tests__/enrichers/plugin.test.ts:236` loops `for (const aot of [true, false])` and names each test with `(aot: ${aot})`.
- `__tests__/plugin/logixlysia.test.ts:55-62` calls `store.logger.info(request, 'custom')` from a route handler and asserts on the transport mock.

`AGENTS.md:12` (root): `| Tests | \`cd packages/logixlysia && bun test\` | all pass (coverage is on by default) |`.

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


This plan adds no changeset: it changes tests and tooling only, and the published package is byte-identical. Say so in your report.

## Scope

**In scope** (the only files you may modify):

- `packages/logixlysia/bunfig.toml`
- `packages/logixlysia/__tests__/api/surface.test.ts`
- `packages/logixlysia/__tests__/plugin/hook-path-status.test.ts` (create)
- `packages/logixlysia/__tests__/plugin/store-logger-levels.test.ts` (create)
- `AGENTS.md` (one table row)

**Out of scope**: any file under `packages/logixlysia/src/`, `__tests__/plugin/final-line.test.ts` and `logixlysia.test.ts` (copy their helpers into the new files rather than exporting from them), `__tests__/output/*` and `__tests__/logger/*` (plan 075), the `onStart` fallback without a server (it needs `listen()`; not worth a test).

## Steps

### Step 1: Raise the coverage floor to a level that can fail

Run `cd packages/logixlysia && bun run build && bun test --coverage 2>&1 | tail -80` and record the per-file minima for lines and functions. Set `coverageThreshold = { lines = 0.80, functions = 0.70 }` (a few points under the lowest file). Prove the gate fires: temporarily set `lines = 0.99`, run `bun test`, confirm it exits non-zero with a threshold message, then restore `0.80`.

**Verify**: `cd packages/logixlysia && bun test` → exit 0, `0 fail`. Report the per-file minima and the failing output you saw at `0.99`.

### Step 2: The API snapshot test fails loudly in CI without a build and skips visibly elsewhere

In `surface.test.ts`: when `dist/index.js` is missing and `process.env.CI` is set, throw at module scope: `throw new Error('dist/index.js is missing: run `bun run build` before `bun test` (or use `bun run test`)')`. Otherwise use `test.skipIf(!distReady)(...)` so a local run without a build reports the test as skipped, not passed. Delete the `if (!distReady) return` body guard.

**Verify**: `cd packages/logixlysia && rm -rf dist && bun test __tests__/api` → the test shows as skipped (`1 skip`). `CI=1 bun test __tests__/api` → fails with the message. `bun run build && bun test __tests__/api` → passes.

Commit Steps 1 and 2: `test(gates): make the coverage floor and the API snapshot able to fail`.

### Step 3: Hook-path status tests

Create `__tests__/plugin/hook-path-status.test.ts` with a local copy of `createCaptureTransport`, `recordAt` and `run` from `final-line.test.ts`. For `aot` in `[true, false]`, mount `logixlysia(options)` and these routes, then assert the logged `meta.status` and `level` equal what the client received and `levelForStatus` of it:

| route | handler | expected status | expected level |
| --- | --- | --- | --- |
| `/missing` | `() => status(404, 'nope')` | 404 | WARNING |
| `/created` | `() => new Response('made', { status: 201 })` | 201 | INFO |
| `/teapot` | `({ set }) => { set.status = 418; return 'short' }` | 418 | WARNING |
| `/named` | `({ set }) => { set.status = 'Created'; return 'ok' }` | 201 | INFO |
| `/broken` | `() => status(503, 'down')` | 503 | ERROR |

Also assert `response.status` from `run()` matches the expected status, so the test proves the line agrees with the wire. Import `status` from `elysia` as `final-line.test.ts` does.

**Verify**: `cd packages/logixlysia && bun test __tests__/plugin/hook-path-status.test.ts` → `0 fail`, 10 tests.

### Step 4: Store logger level table

Create `__tests__/plugin/store-logger-levels.test.ts`: one app with a capture transport and a route `/log/:level` whose handler calls `store.logger[level](request, 'custom ' + level)` for `level` in `debug`, `info`, `warn`, `error` (use a `switch` or a lookup typed against the store; no `any`). For each, handle the request and assert the transport received a record with level `'DEBUG'`, `'INFO'`, `'WARNING'`, `'ERROR'` respectively and message `custom <level>`. Set `logFilter` to nothing (default) so `DEBUG` is not filtered.

**Verify**: `cd packages/logixlysia && bun test __tests__/plugin/store-logger-levels.test.ts` → `0 fail`, 4 tests.

Commit Steps 3 and 4: `test(plugin): pin hook-path status resolution and store logger levels`.

### Step 5: Document the build precondition

Change the Tests row in `AGENTS.md` to: `| Tests | \`cd packages/logixlysia && bun run build && bun test\` | all pass (coverage is on by default; the API-snapshot test needs \`dist/\`) |`. After any turbo run, `git diff AGENTS.md` must show only this row; revert turbo's appended block if present.

Commit: `docs(agents): build before bun test so the API snapshot runs`.

**Verify**: `bun run format && bun run lint && bun run typecheck && (cd packages/logixlysia && bun run build && bun test)` → all exit 0, `0 fail`.

## Test plan

Fourteen new tests across two new files (Steps 3 and 4), all asserting through the transport the app's user configured. No library code changes.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun run build && bun test` → `0 fail`, at least 737 tests
- [ ] `grep -c "0.80" packages/logixlysia/bunfig.toml` → `1`
- [ ] `grep -c "skipIf" packages/logixlysia/__tests__/api/surface.test.ts` → `1`
- [ ] `git diff --stat 5115bea..HEAD` lists only the five in-scope paths, and `git diff 5115bea..HEAD -- AGENTS.md` changes exactly one line
- [ ] No `.changeset` file added (by design)

## STOP conditions

- The excerpts do not match the live file.
- A row in the Step 3 table logs a different status or level than expected on either `aot` value (that is a real bug; report the row and the observed values, do not change the expectation).
- Bun's coverage threshold turns out to be per-file and a file sits under `0.80` lines or `0.70` functions after you measured (report the file; lower the floor only to just under its value).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- When coverage rises, raise the floor again; it should sit a few points under the lowest file.
- The two new test files copy three small helpers from `final-line.test.ts`; a later cleanup may move them to `__tests__/_helpers/`.
