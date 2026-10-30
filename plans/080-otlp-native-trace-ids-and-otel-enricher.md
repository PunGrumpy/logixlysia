# Plan 080: OTLP records carry native `traceId`/`spanId`, and `logixlysia/otel` ships an `otelEnricher()`

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e27dd76..HEAD -- packages/logixlysia/src/adapters/otlp-core.ts packages/logixlysia/src/otel.ts packages/logixlysia/__tests__/adapters/otlp.test.ts packages/logixlysia/__tests__/otel` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `e27dd76`, 2026-10-30

## Why this matters

The OTLP and HyperDX docs say "pair this with `logixlysia/otel` to include `context.trace_id` / `context.span_id` and correlate logs with traces". Backends join a log to its trace on the OTLP log record's own `traceId` and `spanId` fields, not on an attribute named `context.trace_id`. The encoder never sets those fields, so the "logs for this trace" view stays empty for users who followed the docs. The Sentry adapter already lifts `context.trace_id` out of the meta (`src/sentry.ts:76-82`), so there is a precedent. Second, trace injection is hand-wired in `onRequest` in the docs although `config.enrichers` exists for exactly this; a one-function `otelEnricher()` makes the enricher API the single route for request context.

## Current state

- `packages/logixlysia/src/adapters/otlp-core.ts:64-70`, each log record:

```ts
              logRecords: entries.map(entry => ({
                attributes: toOtlpAttributes(flattenMeta(entry.meta)),
                body: { stringValue: defaultBody(entry) },
                severityNumber: OTEL_SEVERITY[entry.level],
                severityText: entry.level,
                timeUnixNano: toUnixNanos(entry.timestamp)
              })),
```

`src/hyperdx.ts` builds on `createOtlpCore` too, so it gets the fix for free. `getPath` is exported from `./shared` (used by `src/sentry.ts:77`).

- `src/sentry.ts:76-82` (`traceIdFor`) validates `context.trace_id` against a `TRACE_ID_PATTERN` and lowercases it. Reuse the idea, not the function.
- `src/enrichers.ts:18-21` has the W3C shapes: a trace id is 32 lowercase hex characters, a span id 16, and the all-zero values are invalid (`ZERO_TRACE_ID`, `ZERO_SPAN_ID`).
- `src/otel.ts` (whole file, 34 lines) exports `TraceContextFields` and `injectTraceContext(logger, request)`, which reads the active span via `getOtelApi()` and merges `{ span_id, trace_id }` into the request context. The enricher type is `src/types/enricher.ts`: an `Enricher` has `request?: (request: Request) => EnricherFields`.
- `__tests__/api/__snapshots__/surface.test.ts.snap` lists `"./otel": ["injectTraceContext"]`. Adding an export means rebuilding and updating the snapshot (`AGENTS.md`: `bun run build` first, then `bun test --update-snapshots __tests__/api`).
- Docs: `apps/docs/content/adapters/otlp.mdx:76`, `apps/docs/content/adapters/hyperdx.mdx:77` (the "pair this with" sentences), `apps/docs/content/features/enrichers.mdx:33` ("matches what Sentry, HyperDX, and OTLP backends expect"), `apps/docs/content/integrations/otel.mdx:16-29` (the `onRequest` example). Docs code blocks are typechecked by `apps/docs/scripts/typecheck-snippets.ts`; `bun run typecheck` at the root runs it.
- Tests: `__tests__/adapters/otlp.test.ts` (uses `stubEnv`, `stubFetch` from `./helpers`, parses `OtlpPayload`); `__tests__/otel/otel-mock.test.ts` mocks `@opentelemetry/api` with `mock.module`; `__tests__/otel/otel.test.ts` runs the "not installed" case in a subprocess.

## Commands you will need

| Purpose | Command (repo root unless noted) | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Build | `bun run build` | `dist/` for 14 entries |
| Snapshot | `cd packages/logixlysia && bun test --update-snapshots __tests__/api` | pass, snapshot updated |
| Lint / format / typecheck | `bun run lint`, `bun run format`, `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | all pass (758 at baseline) |

## Scope

**In scope**:

- `packages/logixlysia/src/adapters/otlp-core.ts`
- `packages/logixlysia/src/otel.ts`
- `packages/logixlysia/__tests__/adapters/otlp.test.ts`
- `packages/logixlysia/__tests__/otel/otel-mock.test.ts`
- `packages/logixlysia/__tests__/api/__snapshots__/surface.test.ts.snap` (regenerated)
- `apps/docs/content/adapters/otlp.mdx`, `apps/docs/content/adapters/hyperdx.mdx`, `apps/docs/content/features/enrichers.mdx`, `apps/docs/content/integrations/otel.mdx`
- `.changeset/otlp-trace-ids-and-otel-enricher.md` (create)

**Out of scope**: `src/sentry.ts`, `src/loki.ts`, `src/datadog.ts` (their id formats are separate work), `src/enrichers.ts`, `src/index.ts`, `src/hyperdx.ts` (inherits the fix).

## Git workflow

- Branch `improve/080-otlp-trace-ids-otel-enricher` from `e27dd76`.
- Commits: `feat(otlp): set traceId and spanId on the log record from the request context`, then `feat(otel): add otelEnricher`, then `docs(otel): route trace injection through enrichers`.
- `git -c commit.gpgsign=false commit …`; no trailers. Do not push.

## Steps

### Step 1: Failing OTLP test

In `otlp.test.ts` add `sets traceId and spanId from context.trace_id and context.span_id`:

- Log with meta `{ context: { span_id: '00f067aa0ba902b7', trace_id: '4BF92F3577B34DA6A3CE929D0E0E4736', trace_flags: '01' } }`.
- Assert the record has `traceId === '4bf92f3577b34da6a3ce929d0e0e4736'` (lowercased), `spanId === '00f067aa0ba902b7'`, `flags === 1`, and that the `context.trace_id` attribute is still present (additive).
- A second test `leaves traceId unset for an invalid or all-zero id`: `trace_id: '0'.repeat(32)` and `trace_id: 'not-hex'` → no `traceId` key on the record; the attribute remains.

Extend the local `OtlpPayload` type with optional `traceId`, `spanId`, `flags`.

**Verify**: both fail on the current code.

### Step 2: Encode the ids

In `otlp-core.ts`, add two top-level regexes `TRACE_ID = /^[\da-f]{32}$/u` and `SPAN_ID = /^[\da-f]{16}$/u`, and a helper `traceFields(meta)` that reads `getPath(meta, 'context.trace_id')` and `getPath(meta, 'context.span_id')` (import `getPath` from `./shared`), lowercases strings, validates against the regexes, rejects the all-zero values, and returns `{ traceId?, spanId?, flags? }` with `flags` parsed from `context.trace_flags` as a hex byte when present. Spread the result into each log record. Keep the attributes untouched.

**Verify**: Step 1 tests pass; `__tests__/adapters/hyperdx.test.ts` still passes.

### Step 3: `otelEnricher()`

In `src/otel.ts` add and export:

```ts
export const otelEnricher = (): Enricher => ({
  request: () => {
    const api = getOtelApi()
    const span = api?.trace.getSpan(api.context.active())
    if (!span) {
      return
    }
    const { traceId, spanId } = span.spanContext()
    return { span_id: spanId, trace_id: traceId } satisfies TraceContextFields
  }
})
```

Import `Enricher` from `./types/enricher`. Have `injectTraceContext` reuse the same span lookup (extract a small `activeSpanFields()` helper so the two do not drift). Add a test in `__tests__/otel/otel-mock.test.ts` (which already mocks the API) that `otelEnricher().request?.(request)` returns the mocked ids, and one plugin-level test there: `logixlysia({ config: { enrichers: [otelEnricher()], transports: [capture], disableInternalLogger: true, disableFileLogging: true } })`, one request, assert `meta.context.trace_id` on the access line.

**Verify**: `cd packages/logixlysia && bun test __tests__/otel` passes.

### Step 4: Build and snapshot

`bun run build`, then `cd packages/logixlysia && bun test --update-snapshots __tests__/api`. The `./otel` entry in the snapshot must now list `injectTraceContext` and `otelEnricher`.

**Verify**: `grep -n -A3 '"./otel"' packages/logixlysia/__tests__/api/__snapshots__/surface.test.ts.snap` shows both names.

### Step 5: Docs

- `integrations/otel.mdx`: make the primary example `logixlysia({ config: { enrichers: [otelEnricher()] } })` with `import { otelEnricher } from 'logixlysia/otel'`; keep `injectTraceContext` documented as the manual form below it.
- `adapters/otlp.mdx:76` and `adapters/hyperdx.mdx:77`: say the ids are written to the record's native `traceId`/`spanId` fields (and kept as `context.*` attributes), so backends join logs to traces.
- `features/enrichers.mdx:33`: keep the sentence true; mention that OTLP and HyperDX set the native record fields from these values.

**Verify**: `bun run typecheck` exit 0 (docs snippets compile).

### Step 6: Changeset, lint, suite

`.changeset/otlp-trace-ids-and-otel-enricher.md`:

```md
---
'logixlysia': minor
---

The OTLP and HyperDX adapters now set the log record's native `traceId`, `spanId` and `flags` from `context.trace_id`, `context.span_id` and `context.trace_flags`, so backends join logs to their traces; the attributes are kept too. `logixlysia/otel` gains `otelEnricher()`, so active-span ids can be attached through `config.enrichers` instead of a hand-written `onRequest` hook.
```

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0; `cd packages/logixlysia && bun test` all pass.

## Test plan

- Two OTLP tests (Step 1), two otel tests (Step 3). Snapshot regenerated (Step 4).

## Done criteria

- [ ] Lint, typecheck exit 0; full suite passes with 4 new tests
- [ ] Snapshot lists `otelEnricher` under `./otel`
- [ ] `grep -n "traceId" packages/logixlysia/src/adapters/otlp-core.ts` has matches
- [ ] Docs example in `integrations/otel.mdx` uses `enrichers: [otelEnricher()]`
- [ ] Changeset (`minor`) present; no files outside scope

## STOP conditions

- The `logRecords` excerpt or `src/otel.ts` does not match.
- `mock.module` in `otel-mock.test.ts` cannot provide an active span for the plugin-level test (report; keep the unit test).
- A docs snippet fails the typecheck for a reason outside these pages.

## Maintenance notes

- Reviewer: check the all-zero and uppercase cases, that `flags` is omitted when `trace_flags` is absent, and that HyperDX output changed in the same way.
- Deferred: native trace fields for Datadog (`dd.trace_id`) and Loki labels.
