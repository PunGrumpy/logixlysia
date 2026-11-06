# Plan 089: A transport can take only the levels it wants through `minLevel`

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report. A reviewer dispatched you and maintains `plans/README.md`, so do not edit the index.
>
> **Drift check (run first)**: `git diff --stat 0873da0..HEAD -- packages/logixlysia/src/types/config.ts packages/logixlysia/src/adapters/shared.ts packages/logixlysia/src/output/index.ts packages/logixlysia/src/desertant.ts`. If a file changed, compare the excerpts below with the live code; a mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `0873da0`, 2026-11-06

## Why this matters

Every transport receives every level. "Send errors to Sentry and everything to Axiom" has no config today, so users write a wrapper by hand. The wrapper is also easy to get wrong: a measured probe with a level filter placed inside `withRedaction` lost an `ERROR` to `queue-full` after 1000 `INFO` records, because the filtered records still filled the redaction queue. The gate has to sit in front of everything.

## Current state

- `packages/logixlysia/src/types/config.ts:5` `Transport` has `log`, optional `flush` and `close`.
- `packages/logixlysia/src/output/index.ts`, end of `logToTransports`:

```ts
for (const transport of transports) {
  try {
    const result = transport.log(level, message, meta)
    if (result) {
      watch(result, onError)
    }
  } catch (error) {
    reportTransportError(error, onError)
  }
}
```

- `packages/logixlysia/src/adapters/shared.ts:32` `BatchTransportOptions` is the option bag of all nine adapters. `createHttpTransport` (`:512`) ends with `return { close, flush: queue.flush, log }` and has `input.options`.
- `packages/logixlysia/src/desertant.ts`, end of `withRedaction`: `return { close: async () => {...}, flush: async () => {...}, log }`.
- `LogLevel` is `'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'`, in `src/types/core.ts`.
- Convention: keep JSDoc on each config field, in plain language (see `onDropped` in `BatchTransportOptions`). Tests use `bun:test`; capture transports are written inline (see `__tests__/output/transports.test.ts`).

## Commands you will need

| Purpose   | Command                                               | Expected |
| --------- | ----------------------------------------------------- | -------- |
| Install   | `bun install --frozen-lockfile`                       | exit 0   |
| Lint      | `bun run lint`                                        | exit 0   |
| Format    | `bun run format`                                      | exit 0   |
| Typecheck | `bun run typecheck`                                   | exit 0   |
| Tests     | `cd packages/logixlysia && bun run build && bun test` | all pass |

## Scope

**In scope**: `packages/logixlysia/src/types/config.ts`, `src/adapters/shared.ts`, `src/output/index.ts`, `src/desertant.ts`, `packages/logixlysia/__tests__/output/min-level.test.ts` (create), `apps/docs/content/features/transports.mdx`, `apps/docs/content/adapters/sentry.mdx`, `.changeset/transport-min-level.md` (create).

**Out of scope**: a `withMinLevel` wrapper (rejected, the field is enough), runtime validation of the value (types catch typos, and an unknown value fails open), `onDropped` (a filtered record is not a lost one), `Transport.log` being called directly by a user (the gate is in the plugin's output layer), and `AGENTS.md` (turbo appends a block to it; run `git checkout -- AGENTS.md` before committing and stage by path).

## Git workflow

Branch `improve/089-transport-min-level` from the worktree HEAD. Conventional commits with no attribution trailer, e.g. `feat(output): let a transport set a minimum level`. Do not push.

## Steps

### Step 1: Add the field and the gate

In `types/config.ts`, add to `Transport`:

```ts
/**
 * The lowest level this transport receives; quieter records skip it and are
 * not counted as dropped. Leave it out to receive every level.
 */
minLevel?: LogLevel
```

In `output/index.ts`, add a module constant and skip below it:

```ts
const LEVEL_RANK: Record<LogLevel, number> = {
  DEBUG: 0,
  ERROR: 3,
  INFO: 1,
  WARNING: 2
}
const isBelowMinLevel = (
  level: LogLevel,
  minLevel: LogLevel | undefined
): boolean => minLevel !== undefined && LEVEL_RANK[level] < LEVEL_RANK[minLevel]
```

In the loop, `continue` when `isBelowMinLevel(level, transport.minLevel)`, before the `try`.

**Verify**: `bun run typecheck` exits 0.

### Step 2: Carry it through adapters and `withRedaction`

Add `minLevel?: LogLevel` with the same JSDoc to `BatchTransportOptions`. Return `minLevel: input.options.minLevel` from `createHttpTransport`. Return `minLevel: transport.minLevel` from `withRedaction`. All nine adapters go through `createHttpTransport`; confirm with `grep -L createHttpTransport packages/logixlysia/src/{axiom,better-stack,clickhouse,datadog,hyperdx,loki,otlp,posthog,sentry}.ts`, which must print nothing or only files that use `adapters/otlp-core.ts`. If an adapter builds its own return object, carry the field there as well.

**Verify**: `bun run typecheck` exits 0.

### Step 3: Tests

Create `__tests__/output/min-level.test.ts`, modelled on `__tests__/output/transports.test.ts`:

1. A plugin with two capture transports, one with `minLevel: 'ERROR'`. A 200 route and a throwing route: the filtered transport gets only the `ERROR` line, the other gets both.
2. `minLevel: 'WARNING'` receives `WARNING` and `ERROR` and skips `DEBUG` and `INFO`, from handler calls to `log.debug/info/warn/error`.
3. `createBetterStackTransport({ minLevel: 'ERROR', sourceToken: 'x' })` exposes `.minLevel === 'ERROR'` (check the real option names in `src/better-stack.ts`), and calling `close()` afterwards leaves no error.
4. `withRedaction({ log() {}, minLevel: 'ERROR' }, redactor).minLevel === 'ERROR'`, and is `undefined` without it. Use a stub redactor as in `__tests__/adapters/desertant.test.ts`.
5. A transport with `minLevel: 'ERROR'` and `onDropped`-style counter inside a `withRedaction` chain: 1000 `INFO` then one `ERROR` through `logToTransports` or the plugin. The `ERROR` arrives. This is the measured regression.

**Verify**: `cd packages/logixlysia && bun test __tests__/output/min-level.test.ts` passes, and each test fails with the `continue` removed (check once, then restore).

### Step 4: Docs and changeset

In `features/transports.mdx`, add a short `## Minimum level` section with the Sentry and Axiom example. In `adapters/sentry.mdx`, show `createSentryTransport({ minLevel: 'ERROR' })`. Create `.changeset/transport-min-level.md` with `'logixlysia': minor` and one sentence for users.

**Verify**: `bun run format`, then `bun run lint` exits 0.

## Test plan

The five cases in Step 3. Existing suites stay green.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0.
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the new tests.
- [ ] `git status` shows only in-scope files; `AGENTS.md` is unchanged.

## STOP conditions

- An adapter cannot carry the field without a change outside the in-scope list.
- Anything in the plugin other than `logToTransports` calls `transport.log`.

## Maintenance notes

Any new wrapper around a transport must forward `minLevel`, as `withRedaction` does, or the inner filter is lost. A reviewer should check the gate runs before `watch` and before any queue.
