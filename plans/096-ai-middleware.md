# Plan 096: `aiMiddleware(log)` records AI SDK usage, streams included, with no hand-copied numbers

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report. A reviewer dispatched you and maintains `plans/README.md`, so do not edit the index.
>
> **Drift check (run first)**: `git diff --stat 0873da0..HEAD -- packages/logixlysia/src/ai.ts packages/logixlysia/src/index.ts apps/docs/content/integrations/ai.mdx`. Plan 095 changes `error` in `createRequestScopedLogger`; anything else that does not match the excerpts is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a hidden hook on the scoped logger, a new dev dependency)
- **Depends on**: `plans/095-log-error-takes-unknown.md`, and on 094 for `package.json` order only
- **Category**: direction
- **Planned at**: commit `0873da0`, 2026-11-06

## Why this matters

`docs/integrations/ai.mdx` has users copy token counts by hand into `mergeAIMetrics(store.logger, request, {...})`. The handler's `log` cannot be used. Worse, in the most common streaming route the numbers reach nobody: measured, `streamText(...).toTextStreamResponse()` writes the access line before the stream ends, so `ai` reaches no sink. The same page warns that a custom log before the merge loses the fields too. After this plan, one middleware line records usage for every route shape.

## Current state

`packages/logixlysia/src/ai.ts` is 75 lines. Totals live in `const totals = new WeakMap<Request, Totals>()`, `foldMetrics` applies the `COMBINE` table, and:

```ts
export const mergeAIMetrics = (
  logger: Pick<Logger, 'mergeContext'>,
  request: Request,
  metrics: AIMetrics
): void => {
  if (Object.keys(metrics).length === 0) {
    return
  }
  const total: Totals = totals.get(request) ?? new Map()
  foldMetrics(total, metrics)
  totals.set(request, total)
  logger.mergeContext(request, { ai: Object.fromEntries(total) })
}
```

`packages/logixlysia/src/index.ts`: the per-request record has `accessLineReplaced: boolean` and `phase: 'open' | 'streaming' | 'closed'` (lines 95–98), kept in `records`. `createRequestScopedLogger(request)` (around line 425) builds the object behind `log`. `runJob` uses the same function.

The AI SDK facts below were measured on `ai` 7.0.114, which is already in `bun.lock` through another workspace:

- A language model middleware is a plain object: `wrapLanguageModel({ model, middleware })`.
- `wrapGenerate({ doGenerate, model })` returns `doGenerate()`'s result, with `usage: { inputTokens: { total }, outputTokens: { total, reasoning } }` and `finishReason: { unified }`. `model` has `modelId` and `provider`.
- `wrapStream({ doStream, model })` returns `{ ...result, stream }`. Chunks have `type`; the first `text-delta` marks first output, and `finish` carries `usage` and `finishReason`.
- This structural type was accepted by `tsc` as `LanguageModelMiddleware` with no import from `ai`:

```ts
interface AIUsage {
  inputTokens: { total: number | undefined }
  outputTokens: { total: number | undefined; reasoning: number | undefined }
}
interface AIModelRef {
  modelId: string
  provider: string
}
interface AIGenerateResult {
  finishReason: { unified: string }
  usage: AIUsage
}
export interface AIMiddleware {
  wrapGenerate: <T extends AIGenerateResult>(o: {
    doGenerate: () => PromiseLike<T>
    model: AIModelRef
  }) => Promise<T>
  wrapStream: <T extends { stream: ReadableStream<any> }>(o: {
    doStream: () => PromiseLike<T>
    model: AIModelRef
  }) => Promise<T>
}
```

The repo's lint forbids `any` and ignore comments. Replace `any` with a chunk type parameter or `unknown` and narrow; never silence a rule.

- `MockLanguageModelV4` and `simulateReadableStream` come from `ai/test`, and run with no network. A working mock:

```ts
const usage = {
  inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 4, reasoning: 1 }
}
const finishReason = { unified: 'stop', raw: 'stop' }
new MockLanguageModelV4({
  provider: 'p',
  modelId: 'm',
  doGenerate: async () => ({
    content: [{ type: 'text', text: 'hi' }],
    finishReason,
    usage,
    warnings: []
  }),
  doStream: async () => ({
    stream: simulateReadableStream({
      initialDelayInMs: 5,
      chunkDelayInMs: 5,
      chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'he' },
        { type: 'text-end', id: '1' },
        { type: 'finish', finishReason, usage }
      ]
    })
  })
})
```

Prototype results for the design below:

| Route                                    | Lines                       |
| ---------------------------------------- | --------------------------- |
| `generateText`                           | Access line with `ai`       |
| Generator stream (`for await ... yield`) | Access line with `ai`       |
| Custom log first                         | Custom line, then `ai` line |
| `toTextStreamResponse()`                 | Access line, then `ai` line |

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Add dev dep | `cd packages/logixlysia && bun add -d ai@^7.0.114` | `bun.lock` and `package.json` change |
| Lint | `bun run lint` | exit 0 |
| Format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun run build && bun test` | all pass |
| API snapshot | `cd packages/logixlysia && bun run build && bun test --update-snapshots __tests__/api` | `./ai` gains `aiMiddleware` |

## Scope

**In scope**: `packages/logixlysia/src/ai.ts`, `src/context/line-settled.ts` (create), `src/index.ts` (`createRequestScopedLogger` only), `packages/logixlysia/package.json` and `bun.lock` (dev dependency only), `__tests__/ai/middleware.test.ts` (create), `__tests__/api/__snapshots__/*`, `apps/docs/content/integrations/ai.mdx`, `.changeset/ai-middleware.md` (create).

**Out of scope**: cost tables, prompt or tool capture, embeddings, a peer dependency on `ai` (the runtime must not import it; `dist/ai.js` stays free of it), holding the access line until a `Response` body ends (a change for the `next` line, and it would lose zero-copy file responses), and `AGENTS.md` (turbo appends a block to it; run `git checkout -- AGENTS.md` before committing and stage by path).

## Git workflow

Branch `improve/096-ai-middleware` from the worktree HEAD. Conventional commits with no attribution trailer, e.g. `feat(ai): record AI SDK usage with aiMiddleware`. Do not push.

## Steps

### Step 1: Know when the line has closed

Create `src/context/line-settled.ts`:

```ts
/**
 * On a request's logger: returns true once merged context can no longer reach
 * the request's line, because it was written or a custom line replaced it.
 * A global symbol, since `logixlysia/ai` and the root are separate bundles.
 */
export const LINE_SETTLED = Symbol.for('logixlysia.lineSettled')
```

In `createRequestScopedLogger`, attach it with `Object.defineProperty(logger, LINE_SETTLED, { enumerable: false, value: () => { const record = records.get(request); return record?.phase === 'closed' || record?.accessLineReplaced === true } })`, so it stays off `RequestScopedLogger`'s type and out of any enumeration.

**Verify**: `bun run typecheck` exits 0.

### Step 2: `mergeAIMetrics(log, metrics)`

Make `mergeAIMetrics` accept both forms, with an overload type. Totals key on whichever object identifies the scope, so widen the map to `WeakMap<object, Totals>`:

```ts
mergeAIMetrics(store.logger, request, metrics) // keeps working, keyed on request
mergeAIMetrics(log, metrics) // keyed on log
```

Discriminate with `instanceof Request` on the second argument. `log.mergeContext` takes the partial only. Rewrite the function's doc comment in plain terms, removing its mention of another library's style.

**Verify**: `bun test packages/logixlysia/__tests__/ai` passes unchanged.

### Step 3: `aiMiddleware(log)`

In `ai.ts`, export `AIMiddleware` and `aiMiddleware`, with no import from `ai`:

- `wrapGenerate`: note `performance.now()`, await `doGenerate()`, record, return the result unchanged.
- `wrapStream`: await `doStream()`, return `{ ...result, stream: result.stream.pipeThrough(new TransformStream(...)) }`. The transform enqueues every chunk unchanged, notes `msToFirstChunk` at the first `text-delta`, and keeps the `finish` chunk. `flush` records.
- Record: build `AIMetrics` with `model: model.modelId`, `provider: model.provider`, `finishReason: finish.finishReason.unified`, `inputTokens`, `outputTokens`, `reasoningTokens`, `totalTokens` (input plus output), `msToFinish`, and for streams `msToFirstChunk` and `tokensPerSecond` (output tokens over seconds from first chunk to finish, omitted when not computable). Call `mergeAIMetrics(log, metrics)`. Then, if `log[LINE_SETTLED]?.() === true`, call `log.info('ai call finished')`, so the fields still reach a sink.
- If no `finish` chunk arrived (an aborted stream), record nothing.
- A record must never break the model call: wrap the body of the record step in `try`/`catch` that swallows, with a one-line comment saying why.

`log` is typed `Pick<RequestScopedLogger, 'info' | 'mergeContext'>`, so `useLogger()`'s result fits as well. Totals key on the `log` object, and `useLogger()` returns a different one, so mixing the two splits the totals; the docs say to use one.

**Verify**: `bun run typecheck` exits 0, and `grep -n "from 'ai'" packages/logixlysia/src/ai.ts` prints nothing.

### Step 4: Tests

Add the dev dependency. Create `__tests__/ai/middleware.test.ts`, with `generateText`, `streamText`, `wrapLanguageModel` from `ai`, the mock above from `ai/test`, and a capture transport with `useTransportsOnly: true`:

1. `generateText` route: one line, the access line, with `context.ai` holding `calls: 1`, `inputTokens: 12`, `outputTokens: 5`, `totalTokens: 17`, `reasoningTokens: 1`, `model`, `provider`, `finishReason: 'stop'`.
2. Two calls in one request sum: `calls: 2`, `inputTokens: 24`.
3. A generator route with `for await (const d of streamText(...).textStream) yield d`: access line with `ai` and a `msToFirstChunk`.
4. `log.info('calling')` before the call: the custom line, then a line `ai call finished` with `ai`.
5. `toTextStreamResponse()`: read the body to the end, wait with `__tests__/_helpers/wait-for.ts`. An access line with status 200, then an `ai call finished` line with `ai`.
6. The stream's text is unchanged by the transform.
7. A type test: `const middleware: LanguageModelMiddleware = aiMiddleware(log)` compiles.
8. `mergeAIMetrics(log, {...})` in a handler reaches the access line; the old form still works.
9. A model whose `doGenerate` rejects: the rejection reaches the caller, no `ai` is recorded.

**Verify**: `cd packages/logixlysia && bun test __tests__/ai` passes. `cd packages/logixlysia && bun run build && grep -c "ai/test\|from\"ai\"" dist/ai.js` prints `0`. Update the API snapshot, which must gain only `aiMiddleware` under `./ai`.

### Step 5: Docs and changeset

Rewrite `integrations/ai.mdx` to lead with:

```ts
import { streamText, wrapLanguageModel } from 'ai'
import { aiMiddleware } from 'logixlysia/ai'

app.post('/chat', ({ log }) =>
  streamText({
    model: wrapLanguageModel({ model, middleware: aiMiddleware(log) }),
    prompt: 'Hello'
  }).toTextStreamResponse()
)
```

Then a table of recorded fields, the four route shapes from the table above, and these limits: a stream the client aborts records nothing; use one logger object per request, `log` or `useLogger()`, because totals are per object; tested against `ai` 7. Keep a short section for `mergeAIMetrics(log, metrics)` for other SDKs. Delete the clause saying the object mirrors another library's field for migration, and the warning that a custom log loses the fields, which no longer holds for the middleware. Create `.changeset/ai-middleware.md` with `'logixlysia': minor`.

**Verify**: `bun run format`, then `bun run lint` exits 0.

## Test plan

Step 4. Existing AI tests stay green.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0.
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the new tests and the updated snapshot.
- [ ] `dist/ai.js` imports nothing from `ai`.
- [ ] `git diff bun.lock` adds only the workspace's dev dependency entry.
- [ ] `git status` shows only in-scope files; `AGENTS.md` is unchanged.

## STOP conditions

- The structural type cannot satisfy `LanguageModelMiddleware` without `any` or a lint ignore.
- The late `log.info` after a closed line writes nothing, or throws, on `toTextStreamResponse()`.
- `bun add` changes anything in `bun.lock` beyond that entry, such as a version bump of `ai` for another workspace.

## Maintenance notes

A new major of the AI SDK will likely change the nested usage shape; the type test in Step 4 fails first. On the Elysia 2 `next` line, the access line may hold until a stream ends, and then `LINE_SETTLED` and the second line can be deleted.
