# Plan 078: `withRedaction` hands records to the wrapped transport without waiting for its batch to send

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e27dd76..HEAD -- packages/logixlysia/src/desertant.ts packages/logixlysia/__tests__/adapters/desertant.test.ts` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e27dd76`, 2026-10-30

## Why this matters

`withRedaction` runs every record through one serial promise chain: redact, then `await transport.log(...)`. A batching adapter's `log()` (`createBatchQueue.push`, `src/adapters/shared.ts:427-441`) returns the whole `flush()` promise whenever the batch reaches `maxBatchSize` and nothing is in flight. So every twentieth record stalls the redaction chain for a full HTTP round trip, including retries. Measured with a zero-cost stub redactor at 1000 logs/s for 3 s against a server with a 200 ms round trip: the adapter alone delivered 3000 of 3000; wrapped, 1299 were delivered and 1705 were dropped as "queue full". The docs say redaction is "off the request path"; in practice wrapping any adapter caps it at about 20 records per round trip. The fix is to stop awaiting delivery inside the chain and to wait for the outstanding deliveries only in `flush()` and `close()`.

## Current state

`packages/logixlysia/src/desertant.ts`:

- `createQueue` (lines 247-274) is a single promise chain; `push` returns `false` past `maxQueue` (default 1000, line 5).
- `deliver` (lines 328-334):

```ts
const deliver = async (
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): Promise<void> => {
  await transport.log(level, message, meta)
}
```

- The queued task (lines 365-389) awaits `deliver` on both the redacted path and the `onFailure === 'forward'` path, each wrapped in `try { … } catch (error) { report(error) }`.
- `flush` and `close` (lines 396-407):

```ts
return {
  close: async () => {
    closed = true
    await queue.drain()
    await (transport as Partial<AdapterTransport>).close?.()
  },
  flush: async () => {
    await queue.drain()
    await (transport as Partial<AdapterTransport>).flush?.()
  },
  log
}
```

- `report` (lines 317-326) swallows a throwing `onError`.
- Test exemplar: `packages/logixlysia/__tests__/adapters/desertant.test.ts`. `createSink()` returns a synchronous transport; `createStubRedactor()` replaces "Anna Müller". The test at line 63 checks `close()` order.

## Commands you will need

| Purpose | Command (repo root unless noted) | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint / format | `bun run lint`, `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| One file | `cd packages/logixlysia && bun test __tests__/adapters/desertant.test.ts` | pass |
| All tests | `cd packages/logixlysia && bun test` | all pass (758 at baseline) |

## Scope

**In scope**:

- `packages/logixlysia/src/desertant.ts`
- `packages/logixlysia/__tests__/adapters/desertant.test.ts`
- `apps/docs/content/integrations/desertant.mdx` (only if it describes delivery timing in a way that becomes wrong; otherwise leave it)
- `.changeset/with-redaction-delivery.md` (create)

**Out of scope**: `src/adapters/shared.ts` (the batch queue is correct; plan 079 edits it), every adapter file, `src/output/*`.

## Git workflow

- Branch `improve/078-with-redaction-delivery` from `e27dd76`.
- Conventional commit, for example `fix(desertant): hand records to the transport without awaiting its batch`.
- `git -c commit.gpgsign=false commit …`; no trailers. Do not push.

## Steps

### Step 1: Failing test for the stall

Add to `desertant.test.ts` a test `does not wait for the wrapped transport's delivery promise between records`:

- A transport whose `log` returns a promise that resolves only when the test calls a `release()` function (use `Promise.withResolvers`), and records how many times `log` was called.
- Wrap it with the stub redactor. Call `transport.log('INFO', 'one')`, `transport.log('INFO', 'two')`, `transport.log('INFO', 'three')`.
- Wait for the redactor to run (`await new Promise(r => setTimeout(r, 10))` or the `waitFor` helper in `__tests__/_helpers/wait-for.ts`).
- Assert `log` was called 3 times while none of the delivery promises has resolved. Then `release()` them and `await transport.flush()`.

**Verify**: the test fails on the current code (only 1 call is observed, because the chain waits on the first promise).

### Step 2: Failing test for `flush()` and `close()` still waiting

Add `flush() waits for deliveries that are still pending`:

- Same deferred transport. Log one record, wait for redaction, start `const flushed = transport.flush()`; assert it is still pending after 10 ms (race it against a timeout), then `release()`; `await flushed` resolves.
- And a delivery rejection after `release` is reported through `onError` (pass `onError` in options; reject one promise; assert `onError` got the error and `flush()` still resolves).

**Verify**: these fail or hang-guard on the current code only if they rely on the new behaviour; if they already pass, keep them as regression pins and say so in NOTES.

### Step 3: Deliver without awaiting

In `withRedaction`:

- Add `const pendingDeliveries = new Set<Promise<void>>()`.
- Replace `deliver` with a function that calls `transport.log(...)` synchronously, and if the result is a thenable, wraps it: add to `pendingDeliveries`, attach `.then(remove, error => { remove(); report(error) })`. A synchronous throw from `transport.log` is caught by the existing `try/catch` around the `deliver` call sites (keep those).
- The queued task no longer awaits delivery, only redaction.
- `flush`: `await queue.drain()`, then `await Promise.allSettled([...pendingDeliveries])`, then the wrapped `flush?.()`. Same for `close` before the wrapped `close?.()`.

Keep the public types unchanged. Keep comments only where the reason is not obvious (one line on why delivery is not awaited is fine).

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters/desertant.test.ts` → all pass, including the ordering test at line 63 (records still reach the transport in log order because `transport.log` is called from the serial chain).

### Step 4: Changeset, lint, suite

`.changeset/with-redaction-delivery.md`:

```md
---
'logixlysia': patch
---

`withRedaction` no longer waits for the wrapped transport to send its batch before redacting the next record, so wrapping a batching adapter no longer caps throughput at one batch per round trip and no longer drops records as "queue full" during a slow send. `flush()` and `close()` still wait for every delivery that was handed over.
```

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0; `cd packages/logixlysia && bun test` all pass.

## Test plan

- Steps 1 and 2 (three tests) in `__tests__/adapters/desertant.test.ts`, modelled on its existing `createSink`/`createStubRedactor` helpers.
- Existing tests there keep passing unchanged.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun test` exits 0 with the new tests
- [ ] `grep -n "await transport.log" packages/logixlysia/src/desertant.ts` returns no match
- [ ] Changeset present; no files outside scope changed

## STOP conditions

- The `deliver`/`flush`/`close` excerpts do not match the live file.
- The ordering test (line 63) or any existing desertant test needs its expectation changed.
- You find `pendingDeliveries` must be bounded to pass a test (it is bounded in practice by `maxQueue`; if a test shows otherwise, report rather than add a cap).

## Maintenance notes

- Reviewer: confirm the redaction chain still serialises redaction (ordering), that a rejected delivery is reported exactly once, and that `flush()` does not resolve before pending deliveries settle.
- Follow-up (not here): the "queue full" report fires once per dropped record; aggregating it belongs with the loss-reporting design noted in the index.
