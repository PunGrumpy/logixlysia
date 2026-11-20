# Plan 115: `logixlysia/otel` adds the active span's trace flags to the request context

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1e4f7cc..HEAD -- packages/logixlysia/src/otel.ts packages/logixlysia/src/helpers/otel-api.ts packages/logixlysia/__tests__/otel/otel-mock.test.ts apps/docs/content/integrations/otel.mdx` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1e4f7cc`, 2026-11-20
- **Executed**: [PR #642](https://github.com/PunGrumpy/logixlysia/pull/642), merged as `4ced623`. The merged flags-byte test uses `0xaa` and expects `trace_sampled: false`, not the `0xab` case written below; see the review record in [README.md](README.md).

## Why this matters

The OTLP and HyperDX adapters write a log record's native `traceId`, `spanId` and `flags` from `context.trace_id`, `context.span_id` and `context.trace_flags`, and their docs tell users to fill that context with `logixlysia/otel` or `traceparentEnricher()`. `traceparentEnricher()` sets all three. `logixlysia/otel` (`otelEnricher()` and `injectTraceContext`) reads only `traceId` and `spanId` from the active span and drops `traceFlags`. So for every user who runs the OpenTelemetry SDK, which is the case `logixlysia/otel` exists for, the exported record never has `flags`, and a backend cannot tell from the log whether its trace was sampled.

After this plan, `logixlysia/otel` adds `trace_flags` (two lowercase hex digits) and `trace_sampled` (a boolean), the same two fields `traceparentEnricher()` adds, so both routes into the context produce the same shape and the adapters' `flags` is set on the SDK path too.

## Current state

The published package lives in `packages/logixlysia` (Bun 1.3.14, TypeScript 6.0.3, tests with `bun:test`). `@opentelemetry/api` is an optional peer dependency and is NOT installed in this repository; the tests mock it.

- `packages/logixlysia/src/otel.ts` — the whole file today (46 lines). This is the file to change:

  ```ts
  import { getOtelApi } from './helpers/otel-api'
  import type { Logger } from './interfaces'
  import type { Enricher } from './types/enricher'

  export interface TraceContextFields {
    span_id?: string
    trace_id?: string
  }

  const activeSpanFields = () => {
    const api = getOtelApi()
    if (!api) {
      return
    }

    const span = api.trace.getSpan(api.context.active())
    if (!span) {
      return
    }

    const { traceId, spanId } = span.spanContext()
    return { span_id: spanId, trace_id: traceId } satisfies TraceContextFields
  }

  /**
   * Injects active OpenTelemetry span IDs into the request context bag when
   * `@opentelemetry/api` is installed and a span is active.
   */
  export const injectTraceContext = (
    logger: Pick<Logger, 'mergeContext'>,
    request: Request
  ): TraceContextFields | undefined => {
    const fields = activeSpanFields()
    if (fields) {
      logger.mergeContext(request, fields)
    }
    return fields
  }

  /**
   * An enricher that adds the active OpenTelemetry span IDs to every request's
   * context. Use it through `config.enrichers`.
   */
  export const otelEnricher = (): Enricher => ({
    request: () => activeSpanFields()
  })
  ```

- `packages/logixlysia/src/helpers/otel-api.ts:3-10` — the minimal type the package uses for the optional API. Also to change:

  ```ts
  export interface OtelApi {
    context: { active: () => unknown }
    trace: {
      getSpan: (
        ctx: unknown
      ) =>
        | { spanContext: () => { traceId: string; spanId: string } }
        | undefined
    }
  }
  ```

  In the real `@opentelemetry/api`, `SpanContext` is `{ traceId: string; spanId: string; traceFlags: number; isRemote?: boolean; traceState?: TraceState }`. `traceFlags` is a one-byte bit field; bit 0 (value `1`) means sampled.

- `packages/logixlysia/src/enrichers.ts:79-85` — what `traceparentEnricher()` adds. Match these two field names and their meaning (do NOT change this file):

  ```ts
  const fields: Record<string, unknown> = {
    span_id: spanId,
    trace_flags: flags,
    trace_id: traceId,
    // `sampled` is the low bit of the flags byte, so an odd value is set.
    trace_sampled: Number.parseInt(flags, HEX_RADIX) % 2 === 1
  }
  ```

  There, `flags` is the two-hex-digit string from the `traceparent` header, for example `'01'`.

- `packages/logixlysia/src/adapters/otlp-core.ts:62-68,83-87` — how the adapters read the flags (do NOT change this file). It accepts exactly two hex digits:

  ```ts
  const traceFlags = (value: unknown): number | undefined => {
    if (typeof value !== 'string') {
      return
    }
    const hex = value.toLowerCase()
    return TRACE_FLAGS.test(hex) ? Number.parseInt(hex, HEX_RADIX) : undefined
  }
  // ...
  const flags = traceFlags(getPath(meta, 'context.trace_flags'))
  return {
    ...(traceId && { traceId }),
    ...(spanId && { spanId }),
    ...(traceId && flags !== undefined && { flags })
  }
  ```

  `packages/logixlysia/__tests__/adapters/otlp.test.ts` already pins that `context.trace_flags: '01'` becomes `flags: 1`. This plan does not need another adapter test.

- `packages/logixlysia/__tests__/otel/otel-mock.test.ts` — the tests to extend. Its top (lines 1-32):

  ```ts
  import { afterEach, describe, expect, mock, test } from 'bun:test'
  import { Elysia } from 'elysia'
  import { logixlysia } from '../../src'
  import { resetOtelApi } from '../../src/helpers/otel-api'
  import { createLogger } from '../../src/logger'
  import { injectTraceContext, otelEnricher } from '../../src/otel'

  const fakeSpanContext = {
    spanId: '0123456789abcdef',
    traceId: 'abc123def456789012345678abcdef01'
  }

  interface FakeSpan {
    spanContext: () => typeof fakeSpanContext
  }

  const getSpanMock = mock((): FakeSpan | undefined => ({
    spanContext: () => fakeSpanContext
  }))

  mock.module('@opentelemetry/api', () => ({
    context: { active: () => ({}) },
    trace: { getSpan: getSpanMock }
  }))

  describe('logixlysia/otel (mocked)', () => {
    afterEach(() => {
      resetOtelApi()
      getSpanMock.mockImplementation(() => ({
        spanContext: () => fakeSpanContext
      }))
    })
  ```

  It has four tests. Two use exact equality and will need their expected value extended:

  ```ts
  // lines 34-55, test 'injects trace_id & span_id when OTel API returns an active span'
  expect(result).toEqual({
    span_id: fakeSpanContext.spanId,
    trace_id: fakeSpanContext.traceId
  })
  ```

  ```ts
  // lines 75-84, test 'otelEnricher returns the active span ids'
  expect(fields).toEqual({
    span_id: fakeSpanContext.spanId,
    trace_id: fakeSpanContext.traceId
  })
  ```

  The last test (`otelEnricher puts the span ids on the access log context`, lines 86-113) sends a request through the plugin with a capture transport and asserts `events[0]?.context` with `toMatchObject`.

- `packages/logixlysia/__tests__/otel/otel.test.ts` — runs the "API not installed" case in a subprocess. It needs no change.

- `apps/docs/content/integrations/otel.mdx:41` — the last paragraph of the page:

  > When an active span exists, `trace_id` and `span_id` are merged into the request context bag and appear on the access log and on every custom log line. Logixlysia does not start an OpenTelemetry SDK—you bring your own tracer provider and instrumentation.

Repo conventions that apply:

- Lint and format are Ultracite (oxlint + oxfmt). `bun run format` fixes most findings, including object-key order. No `any`. Numeric literals get a named constant (see `HEX_RADIX` in `enrichers.ts`). Bitwise operators are avoided; the existing code tests the sampled bit with `% 2 === 1`.
- No comments that narrate the code. A comment is for a non-obvious why only.
- Any change under `packages/logixlysia/` needs a changeset: `.changeset/<slug>.md` with `'logixlysia': patch|minor`. An example from this repository:

  ```md
  ---
  'logixlysia': minor
  ---

  The JSON console line now carries the `service` option as a `service` key, placed after `level`. Before, `service` only reached the text line's `[name]` prefix, so records from several services could not be told apart once they were collected in one place. A record without a configured service is unchanged.
  ```

## Commands you will need

Run from the root of your checkout unless a row says otherwise.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Build the package | `bun run build --filter logixlysia` | exit 0 (the API-snapshot test reads `packages/logixlysia/dist`) |
| Lint + format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck (package and docs snippets) | `bun run typecheck` | exit 0 |
| One test file | `cd packages/logixlysia && bun test __tests__/otel/otel-mock.test.ts` | `0 fail` (the exit code is 1 for a subset: the coverage threshold applies to the whole suite; judge a subset by its pass and fail counts) |
| Full suite | `cd packages/logixlysia && bun test` | exit 0, `0 fail`; 1192 tests pass at `1e4f7cc` |

Notes that are facts about this repository:

- `turbo` (behind `bun run build` and `bun run typecheck`) can append an agent-guidance block to `AGENTS.md`. If `git status --short` ever shows `AGENTS.md` as modified, run `git checkout -- AGENTS.md`. Never commit `AGENTS.md`.
- One test, `an app bundled into one file > logs through pino-pretty with prettyPrint` (`__tests__/logger/bundled-app.test.ts`), spawns two subprocesses and has failed under heavy machine load. If it is the only failure, run `cd packages/logixlysia && bun test __tests__/logger/bundled-app.test.ts` once; if that passes, rerun the full suite and report both results.
- Never run `bun install` without `--frozen-lockfile`. Never commit `bun.lock`, `dist/`, `.turbo/`, `node_modules/` or anything under `plans/`.

## Scope

**In scope** (the only files you should modify or create):

- `packages/logixlysia/src/otel.ts`
- `packages/logixlysia/src/helpers/otel-api.ts`
- `packages/logixlysia/__tests__/otel/otel-mock.test.ts`
- `apps/docs/content/integrations/otel.mdx` (one paragraph)
- `.changeset/otel-trace-flags.md` (create)

**Out of scope** (do NOT touch, even though they look related):

- `packages/logixlysia/src/adapters/otlp-core.ts`, `src/otlp.ts`, `src/hyperdx.ts` and their tests — they already read `context.trace_flags`.
- `packages/logixlysia/src/enrichers.ts` — `traceparentEnricher()` is the reference, not a target. Do not extract a shared helper between it and `otel.ts`.
- `packages/logixlysia/__tests__/otel/otel.test.ts` — the "not installed" case is unaffected.
- `packages/logixlysia/__tests__/api/__snapshots__/surface.test.ts.snap` — the snapshot lists value exports only, and this plan adds none. If it changes, something went wrong.
- `apps/docs/content/adapters/otlp.mdx`, `apps/docs/content/adapters/hyperdx.mdx` — already describe `context.trace_flags`.
- `skills/logixlysia/SKILL.md`, `AGENTS.md`, `plans/**`.
- `tracestate`. The SDK's `traceState` is not part of this change.

## Git workflow

- Branch: `feat/otel-trace-flags`, created from `origin/main` (the operator may already have created it for you; if you are on it, do not create another).
- Three commits, in this order, with these subjects (Conventional Commits, lower case after the colon, no trailing period):
  1. `feat(otel): add the active span's trace flags to the request context` — `otel.ts`, `otel-api.ts` and the test file.
  2. `docs(otel): list the trace flags the integration adds` — `otel.mdx`.
  3. `chore(changeset): note the trace flags from logixlysia/otel` — the changeset file.
- Each commit message has the subject, a blank line, then one or two short paragraphs of plain prose wrapped at 72 columns that say what was wrong and what the change does. No bullet lists, no headings. An example from this repository's history:

  ```
  fix(status): read a status() result from either Elysia line

  Elysia 2 builds `status()` as an `ElysiaStatus` that carries its code
  in `status` and leaves `response` unset for a bodiless code, where 1.x
  builds an `ElysiaCustomStatusResponse` with `code`. The plugin matched
  only the 1.x class, so on 2.x a thrown or returned status() was logged
  as a non-Error object with the wrong level. Both shapes now read back
  as one code and body.
  ```

- Stage files by name (`git add <path> …`). Never `git add -A`, `git add .` or `git commit -a`.
- No `Co-Authored-By`, `Signed-off-by` or "Generated with" line. No mention of AI, assistants, agents or models anywhere: not in a commit message, a code comment, a test name, a docs page or the changeset.
- If `git commit` fails because commit signing is unavailable, retry that commit as `git -c commit.gpgsign=false commit …`. Never change git configuration.
- Do NOT push and do NOT open a pull request. The operator does both.

## Steps

### Step 1: Write the failing tests

Edit `packages/logixlysia/__tests__/otel/otel-mock.test.ts`:

1. Give the fake span context a sampled flag and let a test swap the context:

   ```ts
   const fakeSpanContext = {
     spanId: '0123456789abcdef',
     traceFlags: 1,
     traceId: 'abc123def456789012345678abcdef01'
   }

   interface FakeSpan {
     spanContext: () => {
       spanId: string
       traceFlags?: unknown
       traceId: string
     }
   }
   ```

   Keep `getSpanMock`, `mock.module(...)` and the `afterEach` as they are (the `afterEach` already restores the default implementation).

2. In the two tests that use `toEqual` on the returned fields (`injects trace_id & span_id when OTel API returns an active span` and `otelEnricher returns the active span ids`), extend the expected object to:

   ```ts
   {
     span_id: fakeSpanContext.spanId,
     trace_flags: '01',
     trace_id: fakeSpanContext.traceId,
     trace_sampled: true
   }
   ```

   In the first of the two, also extend the `toMatchObject` on `logger.getContext(request)` with `trace_flags: '01'` and `trace_sampled: true`.

3. In the last test (`otelEnricher puts the span ids on the access log context`), extend the `toMatchObject` on `events[0]?.context` with `trace_flags: '01'` and `trace_sampled: true`.

4. Add two tests inside the same `describe`, after the test `otelEnricher returns the active span ids`:

   ```ts
   test('an unsampled span reports trace_flags 00 and trace_sampled false', () => {
     resetOtelApi()
     getSpanMock.mockImplementation(() => ({
       spanContext: () => ({ ...fakeSpanContext, traceFlags: 0 })
     }))

     const fields = otelEnricher().request?.(new Request('http://localhost/'))

     expect(fields).toEqual({
       span_id: fakeSpanContext.spanId,
       trace_flags: '00',
       trace_id: fakeSpanContext.traceId,
       trace_sampled: false
     })
   })

   test('leaves the flags out when the span context has none it can read', () => {
     const idsOnly = {
       span_id: fakeSpanContext.spanId,
       trace_id: fakeSpanContext.traceId
     }
     const unreadable: unknown[] = [undefined, 256, -1, 1.5, '01', null]

     for (const traceFlags of unreadable) {
       resetOtelApi()
       getSpanMock.mockImplementation(() => ({
         spanContext: () => ({ ...fakeSpanContext, traceFlags })
       }))

       expect(
         otelEnricher().request?.(new Request('http://localhost/'))
       ).toEqual(idsOnly)
     }
   })
   ```

   Add a third test for a flags byte with other bits set, so the hex formatting is pinned:

   ```ts
   test('writes the whole flags byte as two hex digits', () => {
     resetOtelApi()
     getSpanMock.mockImplementation(() => ({
       spanContext: () => ({ ...fakeSpanContext, traceFlags: 0xab })
     }))

     expect(
       otelEnricher().request?.(new Request('http://localhost/'))
     ).toMatchObject({ trace_flags: 'ab', trace_sampled: true })
   })
   ```

Run `bun run format`.

**Verify**: `cd packages/logixlysia && bun test __tests__/otel/otel-mock.test.ts` → the file has 7 tests; exactly 5 fail (the two extended `toEqual` tests, the access-log test, the unsampled test and the hex test) and 2 pass (`returns undefined when getSpan returns no active span` and `leaves the flags out when the span context has none it can read`). If the five do not fail, STOP: the gap this plan closes is not there.

### Step 2: Read the flags in `logixlysia/otel`

In `packages/logixlysia/src/helpers/otel-api.ts`, add the optional field to the span context type:

```ts
) => {
  spanContext: () => { traceId: string; spanId: string; traceFlags?: number }
} | undefined
```

(Let the formatter decide the line breaks.)

In `packages/logixlysia/src/otel.ts`:

1. Extend the exported interface:

   ```ts
   export interface TraceContextFields {
     span_id?: string
     /** The span's flags byte as two lowercase hex digits, as in a `traceparent` header. */
     trace_flags?: string
     trace_id?: string
     trace_sampled?: boolean
   }
   ```

2. Add a helper that turns the SDK's number into the two fields, and spread it into what `activeSpanFields` returns. Target shape (the behaviour is load-bearing; adjust syntax only as lint requires):

   ```ts
   const HEX_RADIX = 16
   const MAX_TRACE_FLAGS = 0xff

   const flagFields = (
     traceFlags: unknown
   ): Pick<TraceContextFields, 'trace_flags' | 'trace_sampled'> | undefined => {
     if (
       typeof traceFlags !== 'number' ||
       !Number.isInteger(traceFlags) ||
       traceFlags < 0 ||
       traceFlags > MAX_TRACE_FLAGS
     ) {
       return
     }
     return {
       trace_flags: traceFlags.toString(HEX_RADIX).padStart(2, '0'),
       trace_sampled: traceFlags % 2 === 1
     }
   }
   ```

   ```ts
   const { traceId, spanId, traceFlags } = span.spanContext()
   return {
     span_id: spanId,
     trace_id: traceId,
     ...flagFields(traceFlags)
   } satisfies TraceContextFields
   ```

3. Update the two doc comments so they name the flags:

   - on `injectTraceContext`: "Injects the active OpenTelemetry span's ids and trace flags into the request context bag when `@opentelemetry/api` is installed and a span is active."
   - on `otelEnricher`: "An enricher that adds the active OpenTelemetry span's ids and trace flags to every request's context. Use it through `config.enrichers`."

Rules the implementation must keep:

- `trace_flags` is always exactly two lowercase hex digits (`0` → `'00'`, `1` → `'01'`, `171` → `'ab'`), because that is the only shape `otlp-core.ts` accepts.
- `trace_sampled` is `true` exactly when the number is odd.
- A missing, non-number, non-integer, negative or above-255 `traceFlags` adds neither field and still returns `span_id` and `trace_id`. It never throws.
- `span_id` and `trace_id` are returned exactly as before.

**Verify**:

- `cd packages/logixlysia && bun test __tests__/otel/otel-mock.test.ts` → `7 pass`, `0 fail`.
- `bun run lint` → exit 0 (run `bun run format` first if it reports formatting).
- `bun run typecheck` → exit 0.

### Step 3: Commit the change

Stage `packages/logixlysia/src/otel.ts`, `packages/logixlysia/src/helpers/otel-api.ts` and `packages/logixlysia/__tests__/otel/otel-mock.test.ts`, and commit with subject 1 from "Git workflow".

**Verify**: `git log -1 --format=%s` → `feat(otel): add the active span's trace flags to the request context`; `git show --stat --format= HEAD` lists exactly those three files.

### Step 4: Docs paragraph

In `apps/docs/content/integrations/otel.mdx`, replace the last paragraph (the one that starts "When an active span exists") with these two paragraphs:

> When an active span exists, `trace_id`, `span_id`, `trace_flags` and `trace_sampled` are merged into the request context bag and appear on the access log and on every custom log line. `trace_flags` is the span's flags byte as two hex digits, as in a `traceparent` header, and `trace_sampled` is `true` when its sampled bit is set. The [OTLP](/docs/adapters/otlp) and [HyperDX](/docs/adapters/hyperdx) adapters copy the three ids into each record's native `traceId`, `spanId` and `flags`.
>
> Logixlysia does not start an OpenTelemetry SDK—you bring your own tracer provider and instrumentation.

Write them as plain paragraphs (no `>` quote markers). Run `bun run format`, then commit `apps/docs/content/integrations/otel.mdx` with subject 2.

**Verify**: `rg -n "trace_flags" apps/docs/content/integrations/otel.mdx` → at least one match; `bun run lint` → exit 0.

### Step 5: Changeset

Create `.changeset/otel-trace-flags.md` with exactly:

```md
---
'logixlysia': minor
---

`logixlysia/otel` now adds the active span's trace flags to the request context: `trace_flags`, the flags byte as two hex digits, and `trace_sampled`, next to `trace_id` and `span_id`. These are the fields `traceparentEnricher()` already adds. Before, `otelEnricher()` and `injectTraceContext` left them out, so an OTLP or HyperDX record for a span the SDK started never carried the native `flags` field.
```

Run `bun run format`, then commit the file with subject 3.

**Verify**: `bun run lint` → exit 0; `git status --short` → empty.

### Step 6: Full gates

**Verify**:

- `bun run build --filter logixlysia` → exit 0, then `git status --short` → empty (restore `AGENTS.md` with `git checkout -- AGENTS.md` if turbo touched it).
- `bun run lint` → exit 0.
- `bun run typecheck` → exit 0.
- `cd packages/logixlysia && bun test` → exit 0, `0 fail`, 1195 pass (1192 before, plus the 3 new tests).
- `git diff --stat origin/main...HEAD -- packages/logixlysia/__tests__/api` → empty (the API snapshot did not change).

## Test plan

All in `packages/logixlysia/__tests__/otel/otel-mock.test.ts`, following the file's own pattern (mocked `@opentelemetry/api`, `resetOtelApi()` first in each test):

- Extended: the two exact-equality tests and the access-log test now expect `trace_flags: '01'` and `trace_sampled: true`.
- New: `an unsampled span reports trace_flags 00 and trace_sampled false`.
- New: `leaves the flags out when the span context has none it can read` (`undefined`, `256`, `-1`, `1.5`, a string, `null`).
- New: `writes the whole flags byte as two hex digits` (`0xab` → `'ab'`, sampled).
- Verification: `cd packages/logixlysia && bun test` → 1195 pass, 0 fail.

## Done criteria

ALL must hold:

- [ ] `bun run lint` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` exits 0 with `0 fail` and 1195 passing tests
- [ ] `rg -n "trace_flags" packages/logixlysia/src/otel.ts` returns at least two matches
- [ ] `git diff --name-only origin/main...HEAD` lists exactly the five in-scope files
- [ ] `git log --format=%s origin/main..HEAD` shows the three subjects from "Git workflow", newest first
- [ ] `git log --format=%B origin/main..HEAD | rg -i "co-authored|signed-off|generated with"` returns nothing
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts.
- In Step 1 the five tests that should fail already pass.
- A test outside `__tests__/otel/otel-mock.test.ts` fails after Step 2 because it asserts the exact context of a request that used `otelEnricher()` or `injectTraceContext`. Report the test name and file; do not edit it.
- The API snapshot (`__tests__/api/__snapshots__/surface.test.ts.snap`) wants to change.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- `traceparentEnricher()` in `src/enrichers.ts` and `flagFields` in `src/otel.ts` now produce the same two fields from different sources (a header string and an SDK number). If the field names ever change, change both, and `otlp-core.ts`'s `context.trace_flags` read with them.
- Users of `otelEnricher()` will see two more keys in the console context tree and in every sink. That is why the changeset is `minor`.
- A reviewer should check that `flagFields` cannot throw for any value a broken or old `@opentelemetry/api` could hand back, and that the unit test for unreadable values really runs six cases.
- Deferred on purpose: the SDK's `traceState` (the `tracestate` header's counterpart).
