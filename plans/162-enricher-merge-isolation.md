# 162: Isolate errors while applying an enricher's fields

Status: DONE - [PR #684](https://github.com/PunGrumpy/logixlysia/pull/684), squash `fd4f7a54` on `main`.

P1 | correctness | S | low risk | independent | planned at `ab502d19`, 2026-11-27.

## Current state

`apps/docs/content/features/enrichers.mdx:128-132` promises enrichment will not take down a request and subsequent enrichers run. `packages/logixlysia/src/context/enrich.ts:55-65` protects `fields = hook(input)` but calls `contextStore.mergeContext(key, fields)` **after** the catch. The store enumerates keys and reads `partial[field]` (`src/context/request-context.ts:125-132`); extension code can therefore still throw while supplying its fields. `src/index.ts:539,574,876` calls the request and response phases from the plugin lifecycle. The existing integration test throws inside the hook, not while consuming its result.

## Scope and drift

Branch `fix/enricher-merge-isolation` from `ab502d19` in a fresh isolated worktree. Only `packages/logixlysia/src/context/enrich.ts`, `packages/logixlysia/__tests__/enrichers/plugin.test.ts`, `.changeset/enricher-merge-isolation.md`. `git diff --stat ab502d19..HEAD -- packages/logixlysia/src/context/enrich.ts packages/logixlysia/__tests__/enrichers/plugin.test.ts .changeset/enricher-merge-isolation.md` should be empty. No change to the store, direct application calls to `mergeContext`, getter semantics, deep copying, hook binding, reporting policy or public API. No transactional rollback of fields already merged.

## Steps and proof

1. `bun install --frozen-lockfile` at root (0). In `plugin.test.ts`, model two tests on lines 152-174: use `buildApp`, `createCaptureTransport`, and a mock `onError`. For each phase (`request`, `response`), the first hook returns an object with one enumerable getter which throws a test-local `Error`; the next hook of that phase returns `{ survivor: true }`. Call `/ok`. Assert body `ok`, status 200, one `onError` call with that exact error and `sink: 'enricher'`, and one final event with `survivor: true`. This is an in-process test of a local extension; use no network or external inputs. Run `bun test ./packages/logixlysia/__tests__/enrichers/plugin.test.ts` before changing source; both new cases must distinguish base from intended behavior.
2. In `runPhase` use a single per-hook `try { const fields = hook(input); if (fields) { contextStore.mergeContext(key, fields) } } catch (error) { reportEnricherError(error, onError) }`. Let the loop advance normally. Keep the existing reporter. Re-run the focused suite; all cases pass, including the original directly-throwing hook.
3. Add `.changeset/enricher-merge-isolation.md` with `'logixlysia': patch`. Final gates at root: `git diff --check`, `bun run lint`, `bun run typecheck`, `bun run build`, `(cd packages/logixlysia && bun run build && CI=true bun test)` all exit 0 under Bun 1.3.14. Put the fix, tests and changeset in one atomic conventional commit (`fix(enrichers): isolate failures while applying returned fields`), with no attribution. Do not edit the index, push, file a PR or merge.

Stop if the base already behaves correctly, either phase fixture does not exercise the real merge, a gate fails twice, or the fix needs another file. Report actual commands, branch, worktree, commit and files. Future enricher processing belongs inside the same boundary; do not turn a logging failure into an HTTP error or suppress other contributors.
