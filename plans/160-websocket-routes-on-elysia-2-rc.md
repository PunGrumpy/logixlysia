# Plan 160: Find out why WebSocket routes stopped connecting on Elysia 2.0.0-rc.5, and make the suite green on `rc` again or prove it is upstream

> **Executor instructions**: This is an investigation plan with a small, conditional fix. Follow it step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. Do not update `plans/README.md` when a reviewer dispatched you; they maintain the index.
>
> **Drift check (run first)**: `npm view elysia dist-tags --json` — if `rc` is no longer `2.0.0-rc.6`, run step 1 against the current `rc` as well and say so.

## Status

- **Priority**: P1
- **Effort**: S to M (S if the answer is "upstream")
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `e082e24`, 2026-11-26

## Why this matters

The package's peer range is `elysia: ^1.4.30 || ^2.0.0-beta.32`, which admits every 2.0 release candidate, and CI runs the package suite against the `rc` dist-tag (`.github/workflows/validate.yml`, job `elysia-2`, "Test on Elysia rc"). That job was green on `main` on 2026-11-22 with `2.0.0-rc.4`. Since `2.0.0-rc.5` (published 2026-11-22T17:33Z) every WebSocket test that opens a real socket fails with `WebSocket connection failed`, on every pull request, whatever it changes. Either Elysia changed how a WebSocket route must be set up, in which case the package's tests, docs and possibly `wrapWs` need to follow, or Elysia has a regression, in which case the maintainer needs a minimal upstream report and a decision about the CI job. Nobody knows which yet.

## Current state

Observed on 2026-11-26 with Bun 1.3.14, in a checkout of `packages/logixlysia` with `bun add --dev elysia@<version> exact-mirror@^1.2.7`:

A probe that needs none of this package's code:

```ts
import { Elysia } from 'elysia'
const { websocket } = await import('elysia/websocket')
const app = new Elysia()
  .use(websocket())
  .ws('/ws', {
    message(ws, m) {
      ws.send(m)
    }
  })
  .listen(0)
const socket = new WebSocket(`ws://localhost:${app.server?.port}/ws`)
// 'open' then echo on rc.4; 'error' on rc.5 and rc.6. A plain GET /ws answers 404 on all three.
```

| Elysia | `new Elysia().use(websocket()).ws(...)` | the same with `logixlysia()` before or after `websocket()` |
| --- | --- | --- |
| `2.0.0-rc.4` | connects, echoes | connects, echoes |
| `2.0.0-rc.5` | `error` event, no connection | `error` event |
| `2.0.0-rc.6` | `error` event, no connection | `error` event |

Without `websocket()`, all three versions refuse to start: `[Elysia] .ws() requires the WebSocket capability: import { websocket } from 'elysia/websocket' and .use(websocket())`.

`2.0.0-beta.32` (the `next` dist-tag) passes the whole suite in CI.

In this repository:

- `packages/logixlysia/__tests__/_helpers/elysia.ts` — `websocketCapability()` returns `websocket()` from `elysia/websocket` on Elysia 2 and an empty `new Elysia()` on 1.x; `wsContext(ws)` reads `ws` on 2.x and `ws.data` on 1.x.
- Tests that open a real socket: `__tests__/websocket/wrap-ws-server.test.ts`, `__tests__/websocket/wrap-ws-results.test.ts`, `__tests__/websocket/wrap-ws-iterators.test.ts`, `__tests__/plugin/setup-plugin.test.ts` ("a WebSocket route above the setup plugin gets log"). In the failing CI run 21 tests failed, all with `WebSocket connection failed` from `__tests__/_helpers/await-open.ts`.
- `packages/logixlysia/src/websocket/wrap-ws.ts` — `wrapWs`; not involved in the probe above.
- Docs that show a WebSocket route: `apps/docs/content/features/websocket.mdx`, `skills/logixlysia/SKILL.md`, `packages/logixlysia/README.md`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Switch Elysia (in `packages/logixlysia`) | `bun add --dev "elysia@2.0.0-rc.6" "exact-mirror@^1.2.7"` | exit 0 (never commit the resulting `package.json` or `bun.lock` change) |
| Build | `cd packages/logixlysia && bun run build` | exit 0 |
| WebSocket tests | `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test __tests__/websocket __tests__/plugin/setup-plugin.test.ts` | all pass on 1.4.x and on rc.4; today 21 fail on rc.6 |
| Full suite | `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` | 0 fail |
| Lint / typecheck | `env -u FORCE_COLOR -u NO_COLOR bun run lint`, `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` | exit 0 (typecheck runs against Elysia 1.4 only) |
| Restore the lockfile | `git checkout -- packages/logixlysia/package.json bun.lock && bun install --frozen-lockfile` | clean `git status` |

## Scope

**In scope**, only if step 2 finds a supported way to make a route connect on rc.6:

- `packages/logixlysia/__tests__/_helpers/elysia.ts` and the four test files above
- `apps/docs/content/features/websocket.mdx`, `skills/logixlysia/SKILL.md`, `packages/logixlysia/README.md` (the WebSocket example only)
- `packages/logixlysia/src/websocket/wrap-ws.ts`, only if `wrapWs` itself must change, and then with a test that fails first
- `.changeset/<slug>.md` when anything under `packages/logixlysia/` changes

**Out of scope**:

- `.github/workflows/**`. Whether the `rc` job should be pinned, skipped or left red is the maintainer's decision; describe the options in your report.
- `packages/logixlysia/package.json` and `bun.lock` (the peer range and the dev version stay as they are).
- Any workaround that reaches into Elysia internals (`~ext`, `~hasWS`, private fields).

## Git workflow

- Branch: `fix/websocket-on-elysia-2-rc`, cut from `origin/main`.
- Atomic conventional commits with a body that says why. No attribution of any kind: no `Co-Authored-By`, no `Generated with`, no tool or model names in commits, changesets, code or PR text. Never name another logging library outside the two comparison pages.
- Commits are signed by the repository's git config. Do not change git config.
- Do NOT push or open a PR unless the operator who dispatched you told you to.

## Steps

### Step 1: Reproduce without this package

Write the probe from "Current state" to a file outside the repository tree that imports `elysia` from `packages/logixlysia/node_modules` (run it with `bun` from inside `packages/logixlysia`), install rc.6, and confirm the table row. Then also try: the route registered before `.use(websocket())`; `websocket()` used on a parent app and the route on a child plugin; `app.listen({ port: 0 })`; a client that connects to `127.0.0.1` instead of `localhost`; and an `open` hook only. Record what each does.

**Verify**: you have a table of variant × {rc.4, rc.6} with connect / error for each.

### Step 2: Find what changed between rc.4 and rc.5

Unpack both tarballs (`npm pack elysia@2.0.0-rc.4` and `@2.0.0-rc.5` into a temp directory) and diff `dist/adapter/bun/`, `dist/ws/` (or wherever the WebSocket code lives) and `dist/websocket*`. Read the diff until you can state in two sentences what rc.5 does differently when an upgrade request arrives. Check the upstream repository for a changelog entry, a commit message or an open issue about it (`gh search issues --repo elysiajs/elysia websocket`, `gh api repos/elysiajs/elysia/commits?sha=<the 2.0 branch>`).

**Verify**: one of these is true and you can quote the evidence:

- (A) rc.5 requires a different setup (a new option, a different import, a different call order), and with that setup the probe connects on rc.6;
- (B) no setup makes the probe connect on rc.6: a regression upstream.

### Step 3A (only for A): Follow the new setup

Change `websocketCapability()` (and the test files only where the helper cannot hide the difference) so the WebSocket tests pass on rc.6 **and** still pass on `2.0.0-beta.32` and on the locked 1.4.x. Update the docs example if a user on rc must write something different, saying from which version. Add a changeset only if `src/` changed.

**Verify**: the WebSocket test command → 0 fail on rc.6, on `2.0.0-beta.32`, and after restoring the lockfile (1.4.x). Then the full suite, lint and typecheck on the restored lockfile → 0 fail, exit 0.

### Step 3B (only for B): Write the upstream report, change nothing here

Produce, in your final report (not in the repository): a minimal reproduction (the probe, the exact versions, expected vs actual), the two-sentence cause from step 2 with the file and line in Elysia's `dist`, and the three options for this repository's CI with one sentence of trade-off each: leave the job red until upstream fixes it; pin the `rc` matrix entry to `2.0.0-rc.4` with a comment; mark the job `continue-on-error`.

**Verify**: `git status --short` in the repository is empty.

### Step 4: Restore

**Verify**: `git status --short` shows no change to `packages/logixlysia/package.json` or `bun.lock`.

## Done criteria

- [ ] The report states A or B with quoted evidence from the rc.4 → rc.5 diff
- [ ] For A: the WebSocket tests pass on rc.6, beta.32 and 1.4.x, the full suite passes on the locked version, lint and typecheck exit 0, and `git diff --stat origin/main` lists only in-scope files
- [ ] For B: no file in the repository changed, and the report holds the reproduction and the three CI options
- [ ] `packages/logixlysia/package.json` and `bun.lock` are unchanged

## STOP conditions

- Making the tests pass on rc.6 would break them on `2.0.0-beta.32` or on 1.4.x.
- The only way to connect on rc.6 reads or writes Elysia internals.
- `wrapWs` itself turns out to misbehave on rc.6 once a socket connects (a different finding: report it with a failing test, do not fold a redesign into this plan).

## Maintenance notes

- The `rc` job is the early warning for the 2.0 release. If it is pinned or skipped, someone has to unpin it; say so in the PR that pins it.
- The peer range admits versions the suite has never run against. If upstream's WebSocket setup changed for good, the README's Elysia 2 section needs the version from which it applies.
