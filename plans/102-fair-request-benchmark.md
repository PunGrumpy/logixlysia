# Plan 102: The benchmark times the same work for every library

## Why this matters

The suite is how the maintainer judges logixlysia against the other logging libraries. Its numbers compared different work, so they could not guide a decision. Fixing that is a precondition for making logixlysia faster than the field.

## Evidence

Runtime: `bun run bench` runs `vitest bench` 5.0.5 under Node v25.9.0. Bun 1.3.14 is not an option: it segfaulted in a probe that ran one of the other request-level plugins.

- **Deferred work, confirmed.** A probe counted sink writes when `app.handle()` resolved. logixlysia: 1. The two other request-level plugins: 0. Both log from `onAfterResponse`, and a count of 1 appeared only after a macrotask. Their work sat outside the old timed region.
- **No-op plain loggers, confirmed.** None of the old plain cases reached a sink. The probe counted 0 lines for the old logixlysia config. The old case for one other library called its wide-event `createLogger().info()`, which only appends to the logger's context and emits nothing until `.emit()`, so the shared instance's `requestLogs` array grew without bound. consola's default level under vitest also drops `info`.
- **No `preset: 'prod'` case, confirmed.** It is now 2.7x slower per request than the default under the same sink (see table).
- **Old versus new, one run, loaded machine.** One other plugin read 99.9k ops/s old and 56.0k new. The other read 118.5k with logging disabled and 66.8k new.

## Change

- Every case writes to one counter sink. A request case starts a promise before `handle()` and awaits it until the sink fires. Each case is checked at start-up to produce exactly one line, so a library that goes quiet fails the run.
- Plain-logger cases use each library's own sink: logixlysia via a transport, one other via a global drain, pino-style libraries via a stream, consola via a reporter, winston via a stream transport.
- New request case `logixlysia (preset prod)`. New reference case, bare Elysia with no logger.
- Dropped the "overhead floor (all sinks disabled)" suite. Its cases did unequal work: one excluded every path, another still built records.
- The file-sink case is unchanged. It times the enqueue, not the write, and only logixlysia has it. A comment says so.
- Sink caveat: sinks differ in kind. logixlysia and one other library receive an object. The pino-based plugin receives a serialized line, so it does the serialization the others skip.

## Verification

Three runs, 05:40 to 05:43 on 2026-11-12. The machine had a load average of 22 to 27 on 64 cores from other workers, and per-case spreads are wide for that reason. Median ops/s, range in parentheses. The limiter is not profiled, so read the gaps as indicative. A fourth run after the last lint-only edits read 97.3k for logixlysia and 37.2k for the prod preset, inside those ranges.

| Request path, timed to the log line  | Median | Range            |
| ------------------------------------ | ------ | ---------------- |
| logixlysia                           | 93.4k  | 82.0k to 93.6k   |
| other plugin 1 (after-response hook) | 56.0k  | 55.9k to 56.9k   |
| other plugin 2 (after-response hook) | 66.8k  | 65.9k to 68.8k   |
| logixlysia preset prod               | 35.0k  | 33.8k to 35.8k   |
| bare Elysia, no logger               | 178.4k | 178.3k to 179.6k |

Plain loggers, logixlysia against the other five (min to max of their medians):

| Suite             | logixlysia                | Others         |
| ----------------- | ------------------------- | -------------- |
| Simple string     | 2.005M (2.003M to 2.007M) | 0.81M to 1.88M |
| Structured object | 629k (623k to 632k)       | 0.39M to 1.46M |
| Deep nested       | 1.131M (1.126M to 1.143M) | 0.51M to 1.72M |

Prod limiter, inferred and not profiled: a noisy 3-round probe put the prod preset near 50 us per request against 36 us for the default. Turning `autoRedact` off brought it to the default's range. Turning `requestId` off did not. A follow-up plan should profile `autoRedact`.

## Out of scope

- Making logixlysia faster, including the prod preset.
- Timing to a written file or to stdout.
- A CI gate on these numbers.
