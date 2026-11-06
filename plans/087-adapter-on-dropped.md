# Plan 087: Adapters and `withRedaction` report how many records they lost

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 1f1d591..HEAD -- packages/logixlysia/src/adapters packages/logixlysia/src/desertant.ts apps/docs/content/adapters/overview.mdx apps/docs/content/integrations/desertant.mdx` must print nothing. If a cited excerpt does not read as quoted below, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none. Disjoint from plan 086.
- **Category**: direction
- **Planned at**: commit `1f1d591`, 2026-11-06

## Why this matters

When an adapter loses logs, nobody can say how many. Measured against the current code: five failed sends gave the adapter's `onError` zero calls and five rejections to the caller, so `onError` cannot count loss. A `log()` after `close()` is silent. A team running a billing audit trail through Datadog cannot alert on "we dropped records" or write a number on a dashboard. A single callback with a count and a reason fixes that, and a three-line user callback gives anyone a running total, so no `stats()` is needed.

## Decisions already made (do not reopen)

1. Add `onDropped?: (info: { count: number; reason: 'closed' | 'queue-full' | 'send-failed' }) => void` to `BatchTransportOptions`, typed inline, with no new exports.
2. There is no `stats()`.
3. Call sites, all through one guarded helper:
   - `push` when the queue is full: `count: 1`, immediately.
   - The catch in `runSend`: `count: entries.length`, before the `background` branch, so foreground and background failures both count.
   - `createHttpTransport`'s `log` when closed: `count: 1`.
4. `onError` and its existing aggregate "entries dropped" report keep working unchanged. `onDropped` is additive.
5. `withRedaction` gets its own `onDropped` with reasons `'closed' | 'queue-full' | 'redaction-failed'`. `'redaction-failed'` fires only when the record is actually lost, so not under `onFailure: 'forward'`.
6. Not in this plan: consolidating the reporter copies, `pendingTransportWork` eviction, the file sink.

## Current state

- `packages/logixlysia/src/adapters/shared.ts:32-78`: `BatchTransportOptions`. `:350-358`: `createBatchQueue`'s input. `:395-415`:

```ts
  const runSend = async (
    entries: LogEntry[],
    background: boolean
  ): Promise<void> => {
    try {
      await Promise.resolve()
      await input.send(entries, !background)
    } catch (error) {
      if (!background) {
        throw error
      }
      report(error)
    } finally {
```

- `shared.ts:461-466`:

```ts
  const push = (entry: LogEntry): Promise<void> | undefined => {
    if (inFlight && buffer.length >= maxWaiting) {
      dropped += 1
      return
    }
```

- `shared.ts:563-569` passes `onError: input.options.onError` into `createBatchQueue`. `:590-598`:

```ts
    log: (level, message, meta) =>
      closed
        ? undefined
        : queue.push({
```

- All nine adapters pass their options through. `axiom`, `better-stack`, `datadog`, `loki`, `posthog` and `clickhouse` pass `options` whole; `sentry.ts:191` spreads them; `otlp.ts` and `hyperdx.ts` pass `options` into `adapters/otlp-core.ts:135`, which forwards `input.options`. A test proves this.
- `packages/logixlysia/src/desertant.ts`, `NeuralRedactionOptions`: holds `onError` with its doc comment. In `withRedaction`, the `log` function:

```ts
    if (closed) {
      return
    }
    const accepted = queue.push(async () => {
      let redacted: { message: string; meta?: Record<string, unknown> }
      try {
        const redactor = await getRedactor()
        redacted = await withCallGroup(redactor, group =>
          redactRecord(redactor, message, meta, group)
        )
      } catch (error) {
        report(error)
        if (onFailure === 'forward') {
```

and `if (!accepted) { report(queueFullError(maxQueue)) }`. Its `report` helper shows the guard style: call inside `try`, swallow with the comment "A reporting hook that throws must not take the log pipeline with it."

- Test patterns: `packages/logixlysia/__tests__/adapters/shared.test.ts` and `__tests__/adapters/desertant.test.ts`. Read how they stub `fetch`.
- Repo style: arrow functions, no comments unless the code cannot show the why, oxlint and oxfmt enforced. Never disable a lint rule or add an ignore comment.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (repo root) | exit 0 |
| Lint and format | `bun run lint`, `bun run format` (repo root) | exit 0 |
| Typecheck | `bun run typecheck` (repo root) | exit 0 |
| Tests | `cd packages/logixlysia && bun run build && bun test` | all pass |

## Scope

**In scope**: `packages/logixlysia/src/adapters/shared.ts`, `src/desertant.ts`, `__tests__/adapters/shared.test.ts`, `__tests__/adapters/desertant.test.ts`, `__tests__/adapters/on-dropped-forwarding.test.ts` (create), `apps/docs/content/adapters/overview.mdx`, `apps/docs/content/integrations/desertant.mdx`, `.changeset/adapter-on-dropped.md` (create).

**Out of scope**: `src/index.ts`, `src/types/*`, `src/output/*`, `src/utils/report.ts`, each adapter file, and the existing `dropped` aggregate in `createBatchQueue`.

## Git workflow

- Branch `improve/087-adapter-on-dropped`.
- Commits: `feat(adapters): report dropped entries through onDropped`, `feat(desertant): report dropped records through onDropped`.
- `git -c commit.gpgsign=false commit …`; no trailers. Run `git checkout -- AGENTS.md` before committing. Do not push.

## Steps

### Step 1: Failing tests

In `shared.test.ts`:

1. A stalled send and a small `maxPendingBatches`: each entry past the limit fires `onDropped({ count: 1, reason: 'queue-full' })`.
2. A 400 response with `retries: 0`: one batch of N entries fires `{ count: N, reason: 'send-failed' }`, from an awaited `flush()` as well as from a background send.
3. Five failed sends, summing `count`, equal the number of entries logged.
4. A send that fails once then succeeds on retry fires nothing.
5. `log()` after `close()` fires `{ count: 1, reason: 'closed' }`.
6. An `onDropped` that throws does not stop the next send, and `flush()` still settles as it would without the hook.

Create `on-dropped-forwarding.test.ts`: a table of all nine factories (`createAxiomTransport` and so on; read each file for the exact export name and its minimal credentials), each built with `onDropped`, then `await transport.close()`, then `transport.log('INFO', 'x')`, asserting the hook fired once with `reason: 'closed'`. No network happens because nothing was queued.

In `desertant.test.ts`: `reason: 'closed'` after `close()`; `'queue-full'` past `maxQueue`; `'redaction-failed'` when the model rejects under the default `onFailure`; nothing fires under `onFailure: 'forward'`.

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters` shows these failing and no other failures.

### Step 2: Implement in `shared.ts`

Add to `BatchTransportOptions`, after `maxPendingBatches`:

```ts
  /**
   * Called with how many entries were lost and why: `queue-full` when too many
   * were already waiting, `send-failed` when a request failed after retries,
   * `closed` for a `log()` after `close()`. Add up `count` for a running total.
   */
  onDropped?: (info: {
    count: number
    reason: 'closed' | 'queue-full' | 'send-failed'
  }) => void
```

Add one module-level helper:

```ts
const notifyDropped = (
  onDropped: BatchTransportOptions['onDropped'],
  count: number,
  reason: 'closed' | 'queue-full' | 'send-failed'
): void => {
  try {
    onDropped?.({ count, reason })
  } catch {
    // A hook that throws must not take the log pipeline with it.
  }
}
```

Add `onDropped?: BatchTransportOptions['onDropped']` to `createBatchQueue`'s input and pass `onDropped: input.options.onDropped` from `createHttpTransport`. Call `notifyDropped` at the three sites from "Decisions". In `log`, turn the ternary into an `if (closed)` block that notifies and returns.

**Verify**: the `shared` tests and the forwarding table pass.

### Step 3: Implement in `desertant.ts`

Add `onDropped?: (info: { count: number; reason: 'closed' | 'queue-full' | 'redaction-failed' }) => void` to `NeuralRedactionOptions` with a one-line doc. Destructure it in `withRedaction`, add a local guarded `notifyDropped(reason)` beside `report`, and call it with `count: 1`:

- in `if (closed)` before the return;
- in `if (!accepted)` after `report`;
- in the redaction catch when `onFailure !== 'forward'`, after `report`.

**Verify**: `bun test __tests__/adapters/desertant.test.ts` passes.

### Step 4: Docs and changeset

- `adapters/overview.mdx`: add a row to the options table after `onError`: `` `onDropped` | `(info: { count, reason }) => void` | — | Called with how many entries were lost and why `` . After the paragraph ending "where `handle` is that function." add a short `### Counting lost entries` section: the three reasons, a four-line example that adds to a counter, and one sentence that it does not replace `onError`.
- `integrations/desertant.mdx:106`: add the matching row with its three reasons.
- `.changeset/adapter-on-dropped.md`: `'logixlysia': minor`, one sentence.

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0, and `cd packages/logixlysia && bun run build && bun test` passes.

## Test plan

The tests in Step 1. Each must fail on the unfixed source. Do not assert on `console.error`.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0 at the repo root
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the API snapshot unchanged
- [ ] `git status --short` lists only in-scope paths
- [ ] `grep -n "notifyDropped(" packages/logixlysia/src/adapters/shared.ts` shows the helper plus exactly three calls

## STOP conditions

- An adapter does not forward its options, which would need an edit to that adapter's file.
- A send can fail without passing through `runSend`'s catch.
- An existing test that asserts `onError` call counts starts failing.

## Maintenance notes

- A new batching path must call `notifyDropped` or its loss is invisible.
- The `dropped` aggregate and `onDropped` overlap on queue-full on purpose: the aggregate is a rate-limited stderr message, `onDropped` is a count. Folding the reporters together stays a separate decision.
