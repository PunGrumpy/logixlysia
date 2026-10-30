# Plan 082: `mergeAIMetrics` sums usage across several model calls in one request

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e27dd76..HEAD -- packages/logixlysia/src/ai.ts packages/logixlysia/__tests__/ai/ai.test.ts` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e27dd76`, 2026-10-30

## Why this matters

`mergeAIMetrics` does `mergeContext(request, { ai: metrics })`, and `mergeContext` replaces each top-level key. A route that makes several model calls (an agent loop, a retry, a tool round trip) logs only the last call's tokens, model and duration, although `AIMetrics.calls` implies a total. Cost dashboards built on `context.ai.totalTokens` undercount. The fix keeps one running total per request and merges that.

## Current state

`packages/logixlysia/src/ai.ts` (whole file, 30 lines):

```ts
export interface AIMetrics {
  calls?: number
  finishReason?: string
  inputTokens?: number
  model?: string
  msToFinish?: number
  msToFirstChunk?: number
  outputTokens?: number
  provider?: string
  reasoningTokens?: number
  tokensPerSecond?: number
  totalTokens?: number
}

export const mergeAIMetrics = (
  logger: Pick<Logger, 'mergeContext'>,
  request: Request,
  metrics: AIMetrics
): void => {
  if (Object.keys(metrics).length === 0) {
    return
  }
  logger.mergeContext(request, { ai: metrics })
}
```

- `src/context/request-context.ts:49-62`: `mergeContext` defines each top-level key of `partial` on the bag, replacing an existing value.
- Tests: `__tests__/ai/ai.test.ts` builds an Elysia app with a capture transport and asserts `meta.context.ai` (`toMatchObject`). The second test ("all AIMetrics fields are preserved") passes every field once.
- Docs: `apps/docs/content/integrations/ai.mdx` (single-call example; last paragraph).

Data shape to name first (the organizing structure, per the repo's preference for a table over branches): a `const COMBINE: Record<keyof AIMetrics, 'sum' | 'last'>` that says how each field merges. `sum`: `calls`, `inputTokens`, `outputTokens`, `reasoningTokens`, `totalTokens`, `msToFinish`. `last`: `model`, `provider`, `finishReason`, `msToFirstChunk`, `tokensPerSecond`. A call with no `calls` field counts as 1.

## Commands you will need

| Purpose | Command (repo root unless noted) | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint / format / typecheck | `bun run lint`, `bun run format`, `bun run typecheck` | exit 0 |
| One file | `cd packages/logixlysia && bun test __tests__/ai/ai.test.ts` | pass |
| All tests | `cd packages/logixlysia && bun test` | all pass (758 at baseline) |

## Scope

**In scope**:

- `packages/logixlysia/src/ai.ts`
- `packages/logixlysia/__tests__/ai/ai.test.ts`
- `apps/docs/content/integrations/ai.mdx`
- `.changeset/ai-metrics-accumulate.md` (create)

**Out of scope**: `src/context/request-context.ts` (its replace semantics are right for everything else), `src/index.ts`, `src/interfaces.ts`. Do not add `getContext` to the `Pick`; keep the accumulator in `ai.ts`.

## Git workflow

- Branch `improve/082-ai-metrics-accumulate` from `e27dd76`.
- Commit: `fix(ai): sum token usage across model calls in one request`.
- `git -c commit.gpgsign=false commit …`; no trailers. Do not push.

## Steps

### Step 1: Failing tests

In `ai.test.ts` add:

1. `sums token counts and counts calls across several merges`: two `mergeAIMetrics` calls in one handler, `{ inputTokens: 100, outputTokens: 50, totalTokens: 150, model: 'a', msToFinish: 200 }` then `{ inputTokens: 10, outputTokens: 5, totalTokens: 15, model: 'b', msToFinish: 30 }`; expect `context.ai` to equal `{ calls: 2, inputTokens: 110, outputTokens: 55, totalTokens: 165, model: 'b', msToFinish: 230 }`.
2. `honours an explicit calls count`: `{ calls: 3, totalTokens: 9 }` then `{ totalTokens: 1 }` → `calls: 4`.
3. `keeps totals per request`: two concurrent requests through `app.handle`, each merging once; each line has its own `ai`.

**Verify**: tests 1 and 2 fail on the current code.

### Step 2: Accumulate

In `ai.ts`:

- Add `const COMBINE` as named above, typed `Record<keyof AIMetrics, 'last' | 'sum'>` so a new field cannot be added without choosing a rule.
- Add `const totals = new WeakMap<Request, AIMetrics>()`.
- In `mergeAIMetrics`: read or create the running total, fold `metrics` into it per `COMBINE` (`sum` adds numbers, treating a missing `calls` on the incoming metrics as 1; `last` overwrites when the incoming value is defined), store it, then `mergeContext(request, { ai: { ...total } })` (a copy, so the bag never aliases the accumulator).
- Keep the early return for an empty `metrics` object.

**Verify**: `cd packages/logixlysia && bun test __tests__/ai/ai.test.ts` → all pass, including the existing "all fields preserved" test (a single merge yields the same object plus `calls: 1`; if that test uses `toEqual` on the full object, update its expectation to include `calls: 1` only if it passed `calls` undefined, and say so in NOTES).

### Step 3: Docs and changeset

- `integrations/ai.mdx`: add one short paragraph after the example: several calls in one request are summed (`calls`, token counts and `msToFinish`), and `model`, `provider` and `finishReason` keep the last call's values.
- `.changeset/ai-metrics-accumulate.md`:

```md
---
'logixlysia': patch
---

`mergeAIMetrics` now keeps a running total per request: token counts, `msToFinish` and `calls` are summed across calls, and `model`, `provider` and `finishReason` keep the last call's values. Before, each call replaced the previous one on the access line.
```

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0; `cd packages/logixlysia && bun test` all pass.

## Test plan

- Step 1's three tests in `__tests__/ai/ai.test.ts`.

## Done criteria

- [ ] Lint, typecheck exit 0; suite passes with 3 new tests
- [ ] `grep -n "COMBINE" packages/logixlysia/src/ai.ts` has matches
- [ ] Docs paragraph and changeset present; no files outside scope

## STOP conditions

- The `ai.ts` excerpt does not match.
- An existing test outside `__tests__/ai` asserts the old replace behaviour.

## Maintenance notes

- Reviewer: check `calls` defaults to 1 per merge, that the stored total is copied before merging into the context, and that the lint rule on magic numbers is satisfied without comments.
- Deferred: accepting the handler's request-scoped `log` instead of `store.logger` plus `request` (API decision).
