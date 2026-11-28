# 161: Report a blocked Loki push instead of acknowledging the batch

Status: DONE - [PR #685](https://github.com/PunGrumpy/logixlysia/pull/685), squash `1f531a10` on `main`.

P1 | correctness | S | low risk | independent | planned at `ab502d19`, 2026-11-27.

## Current state

Grafana's [push contract](https://grafana.com/docs/loki/latest/reference/loki-http-api/#ingest-logs) specifies `260` as the default status when the operator blocks ingestion. It means **none** of the batch was stored. At `packages/logixlysia/src/adapters/shared.ts:439-446`, `if (response.ok)` returns normally for all 2xx responses. At lines 691-698 a normal return marks the batch delivered. `packages/logixlysia/src/loki.ts:116-122` uses this shared factory without a status policy. A normal HTTP transport named "Loki" is not necessarily the built-in Loki adapter.

## Scope and drift

Only `packages/logixlysia/src/{loki.ts,adapters/shared.ts}`, `packages/logixlysia/__tests__/adapters/loki.test.ts`, `apps/docs/content/adapters/loki.mdx` and `.changeset/loki-blocked-push.md`. In a fresh isolated worktree branch `fix/loki-blocked-push` from `ab502d19`, run `git diff --stat ab502d19..HEAD -- packages/logixlysia/src/{loki.ts,adapters/shared.ts} packages/logixlysia/__tests__/adapters/loki.test.ts apps/docs/content/adapters/loki.mdx .changeset/loki-blocked-push.md` (empty). No public options, snapshot, queue, retry-policy or other adapter changes. Do not match on display name or parse server prose.

## Steps and proof

1. From root `bun install --frozen-lockfile` (exit 0). In `loki.test.ts` use the existing `stubFetch` + `try/finally` restore pattern (lines 33-69). With a plain-text `260` stub, buffer two entries below the batch threshold, set `retries: 1`, await the explicit flush: expect rejection containing `HTTP 260`, one fetch and exactly one `onDropped({count: 2, reason: 'send-failed'})`. A second test uses **public** `createHttpTransport` with `name: 'Loki'` against `260`: expect success, one fetch and no drops. Existing success test covers Loki `200`. Run `bun test ./packages/logixlysia/__tests__/adapters/loki.test.ts`; on base only the built-in blocked-push case should fail. No network requests.
2. Preserve `createHttpTransport(input: HttpTransportInput): AdapterTransport` as the public wrapper. Put its existing body in internal `createAdapterTransport(input: HttpTransportInput, failureStatus?: number)` in the shared module, exported **only there**; the wrapper calls it with one argument. Thread `failureStatus` through the internal `PostWithRetryInput` and its construction. The success condition becomes `response.ok && response.status !== input.failureStatus`. Only `createLokiTransport` uses the internal factory's second argument: a named constant for `260`. Let the existing bounded, sanitized HTTP error path and `endBatch` account for it. Do not retry an operator-imposed block: the existing retryable statuses stay unchanged. Run the focused test command again; all pass.
3. Add one Loki troubleshooting bullet describing `260`, accounting, no retry, and that a server deliberately configured to return `200` on a block cannot be distinguished from success. Add a patch changeset (`'logixlysia': patch`). Verify `git diff --check` exits 0. Keep the public HTTP factory's documentation on the public wrapper.
4. Final gates from root: `bun run lint`, `bun run typecheck`, `bun run build`, `(cd packages/logixlysia && bun run build && CI=true bun test)` all exit 0; the built package contains the existing 17 entries. Use Bun 1.3.14. Include one atomic conventional commit (`fix(loki): report a blocked push as a failed batch`) with no attribution. No push, PR, index edits or merge by the executor.

Stop if the locked baseline or red test contradicts these observations, if any scope path drifted incompatibly, or if a gate fails twice. Report command results, exact commit, branch, worktree and changed files. In review check that the public HTTP transport still accepts a generic 2xx even when named `Loki`; Grafana's custom status `200` is an explicit non-goal.
