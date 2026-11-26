# Plan 152: A second plugin instance logs its routes with its request id, its enrichers' fields and its sampling

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat be8daf5..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/src/middleware/request-id.ts packages/logixlysia/__tests__/plugin/multiple-instances.test.ts` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `be8daf5`, 2026-11-26

## Why this matters

An app split into modules often mounts the plugin once per module, each with its own options. Elysia runs only the first instance's `onRequest` hook, and that hook is where an instance pins the request id, runs its request-phase enrichers and tells its sampler that a request began. A second instance therefore writes its lines with none of that: no `requestId` in the context although the response carries the header, no enricher fields, head sampling rolled per record instead of once per request, and tail sampling that never rescues a handler's lines. After this plan a later instance opens its own scope the first time it sees the request, so its lines look like the first instance's.

## Current state

All paths are under `packages/logixlysia/`.

- `src/index.ts` — the plugin. One `createLogixlysiaPlugin` closure per instance: its own `records` WeakMap, `contextStore`, `logger` (with its own sampling runtime), `requestIdConfig`, `enrichers`.
- `src/middleware/request-id.ts` — `getOrCreateRequestId(request, config)`: trusts a valid inbound header, else calls the generator. Nothing remembers the id per request, so two instances generate two ids.
- `src/sampling/index.ts` — `begin(key)` stores one roll per request and marks it in flight for tail sampling. `decide` falls back to a fresh roll per record when `begin` never ran, and returns `'drop'` instead of `'buffer'`.
- `__tests__/plugin/multiple-instances.test.ts` — four tests for this topology; all must keep passing.

`src/index.ts:90-98` (why the second instance is different):

```ts
/**
 * Shared by every plugin instance. Elysia keeps only the first instance's
 * `onRequest` and `wrap` (both dedupe by plugin name), so a second instance,
 * mounted in a sibling module, never sees its requests start and closes them
 * from its own route hooks. ...
 */
const requestStarts = new WeakMap<Request, bigint>()
const lineOwners = new WeakMap<Request, symbol>()

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

`src/index.ts:524-541` (the scope, opened only from `onRequest` and `runJob`):

```ts
const openRequestScope = (
  request: Request,
  setHeaders: Record<string, string | number>
): void => {
  logger.beginRequest(request)
  if (requestIdConfig) {
    const requestId = getOrCreateRequestId(request, requestIdConfig)
    contextStore.pinContext(request, { requestId })
    // Set at the start as well as at close: ...
    setHeaders[requestIdConfig.header] = requestId
  }

  if (enrichers && !isExcluded(request)) {
    applyRequestEnrichers(enrichers, contextStore, request, onSinkError)
  }
}
```

`src/index.ts:872-881` (the only request-time caller):

```ts
    .onRequest(({ request, set, store }) => {
      const record = openRecord(request)
      record.setHeaders = set.headers
      store.beforeTime = record.startedAt
      openRequestScope(request, set.headers)
      ...
```

The per-module derive that does run for a second instance's routes (`src/index.ts`, just above `.onStart`):

```ts
    .derive(({ request }) => ({ log: getRequestScopedLogger(request) }))
```

`closeRequest(request, setHeaders, status, responseHeaders?, error?)` (`src/index.ts:552-590`) is the shared exit: it echoes the id into `setHeaders`, runs response enrichers and calls `logger.finalizeRequest`. `finishRequest` calls it with `record.setHeaders ?? {}`; for a second instance `record.setHeaders` is `undefined` today.

**Observed at `be8daf5`** (two modules, `new Elysia({ prefix: '/a' }).use(logixlysia(a))…` and the same for `/b`, mounted on one app; module B's handler calls `log.info` twice):

| Config | Expected | Observed on B's transport |
| --- | --- | --- |
| both instances `requestId: true` and one enricher returning `{ enriched: 'yes' }` | B's three records carry `context.requestId` equal to the `x-request-id` response header, and `enriched` | `context` is `undefined` on all three; the header is set (by A) |
| B `sampling: { head: { INFO: 50 } }`, 200 requests | every request writes 0 or 3 records | 101, 114 and 111 records for the three lines: rolled per record |
| B `sampling: { head: { INFO: 0 }, tail: { status: 200 } }` | 3 records (rescued) | 1 record: the two handler lines are dropped, not buffered |

## Design (decided, do not redesign)

1. Add `scopeOpen: boolean` to `RequestRecord` (initial `false` in `openRecord`).
2. Make `openRequestScope` idempotent per record: signature `(request, record, setHeaders)`; return at once when `record.scopeOpen`; otherwise set it and do what it does today. Update the `onRequest` and `runJob` callers.
3. Reuse an id another instance already chose. In `src/middleware/request-id.ts` give `getOrCreateRequestId` an optional third parameter `echoed?: unknown`: the value already on the response under this header. Order: a valid inbound request header wins (unchanged); else `echoed` when it is a string that passes `VALID_REQUEST_ID`; else the generator (unchanged). `openRequestScope` passes `setHeaders[requestIdConfig.header]`.
4. Open the scope lazily in two more places:
   - the per-module derive: `({ request, set }) => { const record = openRecord(request); record.setHeaders ??= set.headers; openRequestScope(request, record, set.headers); return { log: getRequestScopedLogger(request) } }`. Leave the global `Logixlysia/log` derive alone.
   - the top of `closeRequest`, for a request that ends before any derive ran (a parse error, a `resolve` short-circuit): `const record = records.get(request)` already exists there; call `openRequestScope(request, record, setHeaders)` when a record exists. `finishJob` passes `{}` and its scope is already open, so it is unaffected.
5. Do not touch the `lineWrittenByAnotherInstance` branch of `finishRequest`, `wrapFetch`, the stream wrappers, or `src/sampling/`.

## Scope

**In scope** (the only files you should modify):

- `packages/logixlysia/src/index.ts`
- `packages/logixlysia/src/middleware/request-id.ts`
- `packages/logixlysia/__tests__/plugin/multiple-instances.test.ts`
- `packages/logixlysia/__tests__/middleware/request-id.test.ts` (only to add a test for the third parameter, if that file exists; otherwise put it in the plugin test)
- `apps/docs/content/features/request-id.mdx` (one sentence, see step 4)
- `.changeset/second-instance-request-scope.md` (create)

**Out of scope** (do NOT touch):

- `packages/logixlysia/src/sampling/**`, `src/logger/**`, `src/context/**` — the scope functions they expose are correct; only the caller is missing.
- Making the first instance's context visible to the second (a shared context store). Each instance keeps its own context; that is by design.
- The WebSocket wrapper.

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

- Branch: `fix/second-instance-request-scope`, cut from `origin/main`.
- Atomic commits, one logical unit each (for example: the fix with its tests, then the docs, then the changeset). Conventional commits with a body that says why. Example from `git log`: `fix(request-id): keep the plugin's request id when context is merged (#649)`.
- **No attribution of any kind**: no `Co-Authored-By`, no `Generated with`, no tool or model names in commit messages, the changeset, code comments, or the PR text.
- Commits are signed by the repository's git config. Do not change git config and do not pass `--no-gpg-sign`.
- Do NOT push or open a PR unless the operator who dispatched you told you to.

## Steps

### Step 1: Write the failing tests

In `__tests__/plugin/multiple-instances.test.ts`, add a `describe('logixlysia plugin - several instances, request scope', ...)` with these tests. Build the apps exactly like the first existing test in the file (`new Elysia({ prefix: '/a' }).use(logixlysia(a.options)).get(...)`, both modules `.use`d on one `new Elysia()`), use `http://localhost/...` URLs, `createCaptureTransport` and `metas`, and `await sleep(30)` before asserting.

1. _a later instance's lines carry the request id the response carries, and its enrichers' fields_: both instances get `{ requestId: true, enrichers: [() => ({ enriched: 'yes' })] }`. Module B's handler calls `log.info('one')` and `log.info('two')`. Request `/b/x`. Expect B's transport to have 3 records, and every record's `context` to equal `{ requestId: <the response's x-request-id header>, enriched: 'yes' }`. Expect A's transport to have 0 records for `/b/x`.
2. _a later instance with a request id sets the header when the first instance has none_: only B has `requestId: true`. Expect the `/b/x` response to have an `x-request-id` header and B's access line `context.requestId` to equal it.
3. _a later instance samples a request as a whole_: B has `sampling: { head: { INFO: 50 } }`; module B is `.get('/:id', ({ log }) => { log.info('one'); log.info('two'); return 'b' })`; send 200 requests to `/b/0` … `/b/199`. Group B's records by `request.url`. Expect every group to have exactly 3 records, the number of groups to be greater than 0 and less than 200.
4. _a later instance's tail rule rescues the handler's lines_: B has `sampling: { head: { INFO: 0 }, tail: { status: 200 } }` and the two `log.info` calls. Expect B's transport to hold 3 records whose messages, sorted, are `['', 'one', 'two']`.

**Verify**: `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test __tests__/plugin/multiple-instances.test.ts` → the four existing tests pass and the four new ones fail (test 1 with `context` undefined, test 2 with a missing header, test 3 with group sizes other than 3, test 4 with 1 record).

### Step 2: Implement the design

Make the changes listed under "Design" in `src/middleware/request-id.ts` and `src/index.ts`. Update the doc comment of `getOrCreateRequestId` with one sentence about the echoed value. Update the comment block at `src/index.ts:90-96` so it says a later instance opens its scope from its derive or at close.

**Verify**: the same test command → 8 pass, 0 fail. Then `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` → exit 0.

### Step 3: Run the whole suite

**Verify**: `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` → 0 fail. Pay attention to `__tests__/plugin/request-id.test.ts`, `run-job.test.ts`, `setup-plugin.test.ts`, `final-line.test.ts` and `__tests__/sampling/`.

### Step 4: Docs and changeset

- `apps/docs/content/features/request-id.mdx`: add one short paragraph saying that when the plugin is mounted in several modules, every instance with `requestId` on logs the id the response carries.
- `.changeset/second-instance-request-scope.md`, `'logixlysia': patch`: say that with the plugin mounted in more than one module, routes of the later instance logged without the request id and enricher fields, sampled each line on its own, and never applied tail rules; they now behave like the first instance's routes.

**Verify**: `bun run format && env -u FORCE_COLOR -u NO_COLOR bun run lint` → exit 0.

## Test plan

The four tests in step 1, modelled on the first test of `__tests__/plugin/multiple-instances.test.ts`. Plus one unit test for `getOrCreateRequestId`'s third parameter: a valid echoed id is returned without calling the generator; an invalid echoed id (for example `'bad id!'`) is ignored; a valid inbound header still wins over the echoed value.

## Done criteria

- [ ] `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test __tests__/plugin/multiple-instances.test.ts` → 8 pass
- [ ] Full package suite → 0 fail
- [ ] `env -u FORCE_COLOR -u NO_COLOR bun run lint` and `bun run typecheck` exit 0
- [ ] `git diff --stat origin/main` lists only in-scope files
- [ ] `.changeset/second-instance-request-scope.md` exists with `'logixlysia': patch`
- [ ] No commit message contains `Co-Authored-By` or `Generated`

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts (the codebase drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- The per-module derive turns out not to run for a second instance's routes (test 1 still shows no context on the handler's lines after step 2). Report what does run; do not move the scope into `getRequestScopedLogger`.
- Any of the four existing tests in `multiple-instances.test.ts` fails after step 2.
- Opening the scope in `closeRequest` changes a line in a single-instance test (it should be a no-op there because `onRequest` already opened it).

## Maintenance notes

- CI also runs the suite against Elysia 2 prereleases (`validate.yml`, job `elysia-2`). The derive and `set.headers` exist there too, but watch that job on the PR: hook dedupe differs between majors.
- If a shared context store across instances is ever wanted, this is the function that would change: `openRequestScope`.
- A reviewer should check that a single-instance app opens the scope exactly once per request (the enrichers must not run twice) and that `runJob` still opens its own.
