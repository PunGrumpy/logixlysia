# Plan 157: A response-phase enricher sees a streamed response's headers

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat be8daf5..HEAD -- packages/logixlysia/src/index.ts` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/152-second-instance-opens-its-request-scope.md (same file; land 152 first)
- **Category**: bug
- **Planned at**: commit `be8daf5`, 2026-11-26

## Why this matters

A response-phase enricher receives `{ durationMs, headers, request, status }`, where `headers` is the merged view of the `Response`'s headers and `set.headers`. For a response whose body streams (a generator handler, `sse()`), the final line is written when the stream ends, and that path forgets the `Response`: the enricher sees only `set.headers`. So `content-type: text/event-stream`, or any header on a `Response` the framework built, is visible for a buffered response and missing for a streamed one.

## Current state

`packages/logixlysia/src/index.ts`.

The record (`src/index.ts:100-108`; plan 152 adds a `scopeOpen` field here):

```ts
interface RequestRecord {
  error?: unknown
  phase: 'open' | 'streaming' | 'closed'
  seenByWrap: boolean
  setHeaders?: Record<string, string | number>
  startedAt: bigint
  streamPulled: boolean
  streamStatus?: number
}
```

In `wrapFetch`'s `settle` (around `src/index.ts:812-831`), the streaming branch keeps only the status, while the buffered branch passes the headers:

```ts
        if (
          record.phase === 'streaming' &&
          (record.streamPulled ||
            (buildsSseBeforePull && isEventStream(response))) &&
          record.error === undefined
        ) {
          ...
          record.streamStatus = responseStatus(response)
          return response
        }
        finishRequest(
          request,
          record,
          responseStatus(response),
          response instanceof Response ? response.headers : undefined
        )
```

The two places that finish a streamed request call `finishRequest` without headers:

```ts
  const settleStream = (request: Request, record: RequestRecord): void => {
    ...
    finishRequest(request, record, record.streamStatus)
  }
```

```ts
const onAbort = (): void => {
  if (record.phase === 'streaming' && record.streamStatus !== undefined) {
    finishRequest(request, record, record.streamStatus)
  }
}
```

`finishRequest(request, record, status, responseHeaders?)` hands `responseHeaders` to `closeRequest`, which builds the enricher's view with `readableResponseHeaders(setHeaders, responseHeaders)`.

## Design (decided)

Add `streamHeaders?: Headers` to `RequestRecord`. Where `record.streamStatus` is set, also set `record.streamHeaders = response instanceof Response ? response.headers : undefined`. Pass `record.streamHeaders` as the fourth argument in `settleStream` and in `onAbort`. Nothing else changes.

## Scope

**In scope**:

- `packages/logixlysia/src/index.ts`
- `packages/logixlysia/__tests__/enrichers/` — add the tests to the existing file that tests response-phase enrichers through the plugin (find it with `rg -ln "response:" packages/logixlysia/__tests__/enrichers packages/logixlysia/__tests__/plugin`), or create `__tests__/enrichers/streamed-response-headers.test.ts`
- `.changeset/streamed-response-headers.md` (create)

**Out of scope**:

- `readableResponseHeaders`, `closeRequest`, the stream wrappers (`wrapAsyncStream`, `wrapSyncStream`).
- `src/enrichers.ts`.

## Commands you will need

Run everything from the repository root unless a row says otherwise. The shell may export `FORCE_COLOR` and `NO_COLOR` together, which makes unrelated color tests fail, so every command below clears both.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install (fresh worktree only) | `bun install --frozen-lockfile` | exit 0 |
| Lint + format check | `env -u FORCE_COLOR -u NO_COLOR bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` | exit 0 |
| Build the package | `cd packages/logixlysia && bun run build` | exit 0 |
| One test file | `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test <path>` | all pass |
| Full package suite | `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` | 0 fail (1517 pass at `be8daf5`; the API snapshot test needs `dist/`) |

Bun is 1.3.14. Tests use `bun:test`. Do not add dependencies.

## Repo conventions that apply

- Lint is Ultracite (Oxlint + Oxfmt), strict. Arrow functions, `const`, `for...of`, no `any`, no `console.log` in source, no nested ternaries, top-level regex literals. Run `bun run format` before you commit, then `bun run lint`.
- Comments: keep a comment only for a non-obvious _why_. Do not narrate what the code does, and do not delete existing comments you did not make obsolete.
- Tests live in `packages/logixlysia/__tests__/<area>/*.test.ts`, import from `../../src`, and assert on behaviour through the public API with literal expected values. Helpers are in `packages/logixlysia/__tests__/_helpers/` (`sleep.ts`, `tmp.ts`, `console.ts`).
- Any change under `packages/logixlysia/` needs a changeset: a new file `.changeset/<slug>.md` with front matter `'logixlysia': patch` (or `minor`) and one paragraph, written for a user of the package, that says what was wrong or missing and what happens now. Exemplar (`.changeset/file-sink-close-race.md`):

  ```md
  ---
  'logixlysia': patch
  ---

  A log line written while `flushLogixlysia(options, { close: true })` was running could reopen the log file while its sink was still registered, ... Such a line now keeps its sink registered, and the next close releases the descriptor.
  ```

- Docs prose (`apps/docs/content/**/*.mdx`, changesets, PR text): short declarative sentences, no long dashes, say what the software does. Never name any other logging library outside `apps/docs/content/comparison.mdx` and `apps/docs/content/migration-from-evlog.mdx`.

## Git workflow

- Branch: `fix/streamed-response-headers`, cut from `origin/main`.
- Atomic commits, one logical unit each (for example: the fix with its tests, then the docs, then the changeset). Conventional commits with a body that says why. Example from `git log`: `fix(sampling): keep a failed request's trail under tail.status and hand tail.keep the error (#661)`.
- **No attribution of any kind**: no `Co-Authored-By`, no `Generated with`, no tool or model names in commit messages, the changeset, code comments, or the PR text.
- Commits are signed by the repository's git config. Do not change git config and do not pass `--no-gpg-sign`.
- Do NOT push or open a PR unless the operator who dispatched you told you to.

## Steps

### Step 1: Failing test

Write a test with a plugin configured with `enrichers: [{ response: ({ headers }) => { seen.push(headers); return {} } }]`, `disableInternalLogger: true`, `disableFileLogging: true`, and a transport so the request is logged. Two routes:

- `/buffered`: returns `new Response('ok', { headers: { 'x-from-response': 'yes' } })`.
- `/stream`: `async function* () { yield 'a'; yield 'b' }`.

Serve the app on an ephemeral port (`app.listen(0)`, as other tests in `__tests__/plugin/` that need a real server do; search for `listen(0)`), `fetch` each route, read the whole body with `await response.text()`, wait briefly, then stop the server.

1. For `/buffered`, the enricher's `headers['x-from-response']` is `'yes'` (passes today; the control).
2. For `/stream`, the enricher's `headers['content-type']` equals `response.headers.get('content-type')` from the `fetch` response, and that value is a non-empty string.

If a generator response has no `content-type` on the wire under this Elysia version, use `sse()` from `elysia` for the stream route instead and assert `text/event-stream`.

**Verify**: `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test <the test file>` → test 2 fails with `undefined`, test 1 passes.

### Step 2: Implement

**Verify**: the same command → 0 fail.

### Step 3: Changeset, lint, full suite

`.changeset/streamed-response-headers.md`, `'logixlysia': patch`: a response-phase enricher now sees the headers of a streamed response, as it does for a buffered one.

**Verify**: `bun run format && env -u FORCE_COLOR -u NO_COLOR bun run lint` → exit 0; `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` → exit 0; `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` → 0 fail.

## Test plan

The two tests in step 1.

## Done criteria

- [ ] The new tests pass
- [ ] Full package suite → 0 fail; lint and typecheck exit 0
- [ ] `.changeset/streamed-response-headers.md` exists with `'logixlysia': patch`
- [ ] `git diff --stat origin/main` lists only in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts (the codebase drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- The streamed response on the wire has no header that `set.headers` lacks, with a generator and with `sse()`: then there is nothing to fix; report what the wire response carries.
- The test passes before the change.

## Maintenance notes

- The `elysia-2` CI job runs this test on Elysia 2, where `sse()` builds its `Response` before the first pull; watch it on the PR.
