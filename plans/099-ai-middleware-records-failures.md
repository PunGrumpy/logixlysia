# Plan 099: `aiMiddleware` records a failed model call

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 91fd02f..HEAD -- packages/logixlysia/src/ai.ts packages/logixlysia/__tests__/ai apps/docs/content/integrations/ai.mdx` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (the stream wrapper changes shape)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `91fd02f`, 2026-11-08

## Why this matters

`aiMiddleware(log)` records usage for calls that finish. Measured against `ai` 7.0.114 with `MockLanguageModelV4`, four of five failure modes record nothing: `doGenerate` rejects, `doStream` rejects, the stream carries an `error` part and ends without a `finish` chunk, and the source stream errors mid-way. Only an `error` part followed by a `finish` whose reason is `error` is recorded today. A request whose model call failed shows no `ai` field at all, so the operator cannot tell "no model was called" from "the model was down". A failed call must count: `errors: 1`, `finishReason: 'error'`, the model, the provider and how long it took, and the error must reach the caller unchanged.

Measured on Bun 1.3.14: a `TransformStream` transformer's `cancel` is never called, neither on an upstream error nor on a downstream cancel, so the current `pipeThrough` wrapper cannot see a mid-stream failure (Bun 1.4 does call it). The wrapper becomes a reader-driven `ReadableStream`.

## Current state

- `packages/logixlysia/src/ai.ts`. `AIMetrics` (lines 4-16) has no error count; `COMBINE` (lines 18-30) maps each field to `'sum'` or `'last'`; `foldMetrics` (lines 36-57) sets `calls` to 1 when the incoming metrics have no numeric `calls`. `AILog` is `Pick<RequestScopedLogger, 'info' | 'mergeContext'>` (line 140). `recordCall` (lines 152-190) merges the metrics and, when the line is settled, writes `log.info('ai call finished')`. The middleware (lines 198-233):

```ts
export const aiMiddleware = (log: AILog): AIMiddleware => ({
  wrapGenerate: async ({ doGenerate, model }) => {
    const startedAt = performance.now()
    const result = await doGenerate()
    recordCall(log, model, result, startedAt)
    return result
  },
  wrapStream: async ({ doStream, model }) => {
    const startedAt = performance.now()
    const result = await doStream()
    let finish: AIFinish | undefined
    let msToFirstChunk: number | undefined
    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<AIStreamChunk, AIStreamChunk>({
          flush: () => {
            if (finish) {
              recordCall(log, model, finish, startedAt, msToFirstChunk)
            }
          },
          transform: (chunk, controller) => {
            if (msToFirstChunk === undefined && chunk.type === 'text-delta') {
              msToFirstChunk = performance.now() - startedAt
            }
            if (isFinishChunk(chunk)) {
              finish = chunk
            }
            controller.enqueue(chunk)
          }
        })
      )
    }
  }
})
```

- Measured chunk shapes from the installed SDK: a provider error inside the stream is `{ type: 'error', error }`; a finish chunk is `{ type: 'finish', finishReason: { raw, unified }, usage }` and `unified` can be `'error'`.
- `packages/logixlysia/__tests__/ai/middleware.test.ts` drives the middleware through `wrapLanguageModel`, `generateText`, `streamText`, `MockLanguageModelV4` and `simulateReadableStream` from `ai/test`, with a `capturingPlugin()` whose transport records `{ ai, message, method, status }` per line. Two tests pin today's silence and must change: "a stream with no finish chunk records nothing" and "a rejected model call reaches the caller and records nothing". Literal `log` mocks in that file are `{ info: mock(), mergeContext: mock() }`.
- `packages/logixlysia/__tests__/ai/ai.test.ts` "all AIMetrics fields are preserved in context" builds `allMetrics` with every field and expects `context.ai` to equal it.
- `apps/docs/content/integrations/ai.mdx` has a "Recorded fields" table, a "Which line carries them" table, and "Limits" whose first bullet says a stream that ends without a finish chunk or fails mid-way records nothing.
- Conventions: Ultracite lint, `bun:test`, comments only for a non-obvious why, changeset required. `ai` is a devDependency only; `src/ai.ts` must keep importing nothing from it.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install (fresh worktree) | `bun install --frozen-lockfile` | exit 0 |
| Lint + format check | `bun run lint` (repo root) | exit 0 |
| Format | `bun run format` (repo root) | exit 0 |
| Typecheck | `bun run typecheck` (repo root) | exit 0 |
| Build + tests | `cd packages/logixlysia && bun run build && bun test` | all pass |
| AI tests only | `cd packages/logixlysia && bun test __tests__/ai` | all pass |

Run `git checkout -- AGENTS.md` before every commit and stage by path.

## Scope

**In scope**:

- `packages/logixlysia/src/ai.ts`
- `packages/logixlysia/__tests__/ai/middleware.test.ts`
- `packages/logixlysia/__tests__/ai/ai.test.ts`
- `apps/docs/content/integrations/ai.mdx`
- `.changeset/ai-middleware-records-failures.md` (create)

**Out of scope**:

- `packages/logixlysia/src/index.ts`, `src/context/line-settled.ts`: the settled-line protocol is unchanged.
- The access line's status: a handler that catches the failure still answers 200; that is the handler's business.
- Prompt or tool capture, cost tables.

## Git workflow

- Branch from `91fd02f`: `improve/099-ai-middleware-records-failures`.
- Commits: `feat(ai): record a failed model call with errors and finishReason error`, then `docs(ai): document the errors field and the failed-call line`.
- No push, no PR.

## Steps

### Step 1: The `errors` field and the failure record

In `packages/logixlysia/src/ai.ts`:

1. Add `errors?: number` to `AIMetrics` (alphabetical, after `calls`) with a doc comment: "Calls that failed: the call rejected, its stream failed or ended without a finish, or its finish reason was `error`." Add `errors: 'sum'` to `COMBINE`.
2. Widen `AILog` to `Pick<RequestScopedLogger, 'info' | 'mergeContext' | 'warn'>`.
3. In `recordCall`, compute `const failed = finishReason.unified === 'error'`, pass `errors: failed ? 1 : undefined` into `mergeAIMetrics` (`foldMetrics` skips a non-number, so `undefined` adds nothing), and when the line is settled write `failed ? log.warn('ai call failed') : log.info('ai call finished')`.
4. Add `recordFailure(log, model, startedAt)`: in a `try` that swallows its own errors like `recordCall`, merge `{ calls: 1, errors: 1, finishReason: 'error', model: model.modelId, msToFinish: performance.now() - startedAt, provider: model.provider }` and, when the line is settled, `log.warn('ai call failed')`.
5. `wrapGenerate`: wrap `await doGenerate()` in `try`/`catch`; on catch call `recordFailure` and rethrow. On success call `recordCall` as today.
6. `wrapStream`: `try`/`catch` around `await doStream()` the same way. Replace the `pipeThrough` with a reader-driven stream:

```ts
const reader = result.stream.getReader()
let finish: AIFinish | undefined
let msToFirstChunk: number | undefined
let recorded = false
const settle = (): void => {
  if (recorded) {
    return
  }
  recorded = true
  if (finish) {
    recordCall(log, model, finish, startedAt, msToFirstChunk)
  } else {
    recordFailure(log, model, startedAt)
  }
}
const stream = new ReadableStream<AIStreamChunk>({
  cancel: reason => reader.cancel(reason),
  pull: async controller => {
    let next: ReadableStreamReadResult<AIStreamChunk>
    try {
      next = await reader.read()
    } catch (error) {
      settle()
      controller.error(error)
      return
    }
    if (next.done) {
      settle()
      controller.close()
      return
    }
    const chunk = next.value
    if (msToFirstChunk === undefined && chunk.type === 'text-delta') {
      msToFirstChunk = performance.now() - startedAt
    }
    if (isFinishChunk(chunk)) {
      finish = chunk
    }
    controller.enqueue(chunk)
  }
})
return { ...result, stream }
```

The finish chunk is authoritative: an `error` part alone does not decide failure (the SDK allows non-fatal error parts), but a stream that ends without a finish does. A downstream `cancel` records nothing; document it as the remaining limit.

**Verify**: `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test __tests__/ai` → the two "records nothing" tests fail, everything else passes.

### Step 2: Tests

In `__tests__/ai/middleware.test.ts`:

- Add `level?: string` to `CapturedLine` and record `_level` in `capturingPlugin`'s transport (rename the parameter from `_level` to `level`).
- Change "a rejected model call reaches the caller and records nothing" to "...and is recorded as a failure": keep the response assertion, then expect `lines[0]?.ai` to match `{ calls: 1, errors: 1, finishReason: 'error', model: 'mock-model', provider: 'mock-provider' }` (give the mock a `modelId` and `provider`) and `msToFinish` to be a number at or above 0.
- Change "a stream with no finish chunk records nothing" to "...is recorded as a failure": expect `log.mergeContext` called once with `{ ai: expect.objectContaining({ calls: 1, errors: 1, finishReason: 'error' }) }`. Add `warn: mock()` to every literal `log` mock in the file.
- Add "a rejected doStream reaches the caller and is recorded": `aiMiddleware(log).wrapStream({ doStream: () => Promise.reject(new Error('401')), model })` rejects with `401` and `mergeContext` was called with `errors: 1`.
- Add "an error part with no finish is recorded as a failure and the part reaches the caller": chunks `[{ type: 'stream-start', warnings: [] }, { type: 'error', error: new Error('overloaded') }]` through `wrapStream`; `Array.fromAsync(stream)` equals the chunks and `mergeContext` got `errors: 1, finishReason: 'error'`.
- Add "a source stream that fails mid-way is recorded and the failure reaches the caller": a `ReadableStream` whose `start` enqueues the first three `streamChunks` then calls `controller.error(new Error('socket hang up'))`; reading the wrapped stream rejects with `socket hang up` and `mergeContext` got `errors: 1`.
- Add "a failed call then a successful one give calls 2, errors 1, finishReason stop": in one handler, `generateText` with a rejecting model (caught) then with `mockModel()`, both wrapped with the same `aiMiddleware(log)`; `lines[0]?.ai` matches `{ calls: 2, errors: 1, finishReason: 'stop', inputTokens: 12 }`.
- Add "a failure after a custom line writes ai call failed at WARNING": handler does `log.info('calling')` then a caught rejecting `generateText`; `lines.map(l => l.message)` equals `['calling', 'ai call failed']` and `lines[1]?.level` is `'WARNING'` with `ai.errors` 1.
- Add "a finish with reason error counts as an error": a `doGenerate` resolving with `finishReason: { raw: 'error', unified: 'error' }` → `ai` matches `{ calls: 1, errors: 1, finishReason: 'error', inputTokens: 12 }`.

In `__tests__/ai/ai.test.ts`, add `errors: 1` to `allMetrics`.

Check the four failure-mode tests fail against the unfixed source once (stash, run, pop) and report which did.

**Verify**: `cd packages/logixlysia && bun run build && bun test` → all pass.

### Step 3: Docs and changeset

`apps/docs/content/integrations/ai.mdx`:

- "Recorded fields": add a row `| \`errors\` | Calls that failed: rejected, stream failed or ended without a finish, or finish reason \`error\` |`after`calls`. In the summing sentence, add `errors` to the summed fields.
- "Which line carries them": after the paragraph on late lines, add: "A failed call that lands after the line writes `ai call failed` at `WARNING` instead."
- "Limits": replace the first bullet with: "A stream the client cancels before it ends records nothing, because the call never finishes on the server."

Create `.changeset/ai-middleware-records-failures.md`:

```md
---
'logixlysia': minor
---

`aiMiddleware(log)` records a model call that fails: `ai.errors` counts them, `finishReason` is `error`, and the model, provider and duration are kept, whether the call rejected, its stream failed mid-way, or it ended without a finish. The error still reaches the caller unchanged. A failure after the request's line was written logs `ai call failed` at `WARNING`.
```

Run `bun run format` at the repo root.

**Verify**: `bun run lint && bun run typecheck` → exit 0.

## Test plan

- `__tests__/ai/middleware.test.ts`: two tests changed, seven added (rejecting generate, rejecting stream, error part without finish, mid-stream failure, failure then success, late WARNING line, finish reason error).
- `__tests__/ai/ai.test.ts`: `errors` preserved.
- `cd packages/logixlysia && bun run build && bun test` → all pass.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun run build && bun test` exits 0
- [ ] `grep -n "pipeThrough" packages/logixlysia/src/ai.ts` returns nothing
- [ ] `grep -n "errors: 'sum'" packages/logixlysia/src/ai.ts` matches
- [ ] `grep -n "from 'ai'" packages/logixlysia/src/ai.ts` returns nothing
- [ ] `git status --short` lists only in-scope files
- [ ] `.changeset/ai-middleware-records-failures.md` exists with `'logixlysia': minor`

## STOP conditions

- The `aiMiddleware` excerpt does not match `src/ai.ts`.
- The "a stream reaches the caller unchanged" test fails after step 1 and the cause is not the `warn` mock.
- Making the stream wrapper work needs a change in `src/index.ts`.
- The installed `ai` package does not accept the new middleware shape under `LanguageModelMiddleware` (the "fits LanguageModelMiddleware" test fails on types).

## Maintenance notes

- Late `ai` lines carry cumulative totals, so `errors` sums too; a sink that adds lines double-counts (already documented for the other sums).
- When the repo moves to Bun 1.4, the reader-driven stream still works; do not switch back to `TransformStream` with `cancel`, which Bun 1.3 ignores.
- Plan 096's test "a failure while recording leaves the model call intact" still holds because `recordFailure` swallows its own errors.
