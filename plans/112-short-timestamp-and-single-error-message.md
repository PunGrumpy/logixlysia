# Plan 112: short timestamp on a terminal, error message once

## Why this matters

On a developer's terminal the default line opened with a 24-character ISO timestamp, date and `Z` included, before the reader reached the method and path. A failed request also printed its message twice: at the end of the main line and again as the first `error` row of the tree under it.

## Evidence

A probe app with `service: 'my-api'` and `useColors: false`, run on a pseudo-terminal (`script -qc`), before the change:

```
2026-11-12T06:15:32.448Z [my-api] WARN  GET     /missing 404 0.68ms NOT_FOUND
  ├─ error  NOT_FOUND
  └─ error.code  NOT_FOUND
2026-11-12T06:15:32.449Z [my-api] ERROR GET     /boom 500 0.64ms Payment failed
  ├─ error  Payment failed
  ├─ error.at  probe.ts:18:15
  ├─ Caused by: Error: connect ECONNRESET 10.0.0.12:443
  └─   at probe.ts:19:18
```

`handleHttpError` sets `data.message` to the parsed error message, `{message}` prints it on the line, and `collectStructuredErrorEntries` pushed the same `parseError` result as the `error` row.

## Change

- `createFormatContext` resolves `translateTime` once. With no `timestamp` and no `customLogFormat` set, a TTY stdout gets local `HH:MM:ss.SSS`. Otherwise it is the user's `translateTime`, or ISO as before.
- `formatLogOutput` passes the printed `{message}` text to `buildContextTreeLines`, which drops the `error` row when it equals that text.

After, same probe and terminal:

```
06:14:41.499 [my-api] WARN  GET     /missing 404 0.67ms NOT_FOUND
  └─ error.code  NOT_FOUND
06:14:41.500 [my-api] ERROR GET     /boom 500 0.66ms Payment failed
  ├─ error.at  probe.ts:18:15
  ├─ Caused by: Error: connect ECONNRESET 10.0.0.12:443
  └─   at probe.ts:19:18
```

## What stays the same

- Piped stdout prints the ISO timestamp, byte-for-byte as before.
- Any `timestamp` option, even `{}`, and any `customLogFormat` keep today's timestamp.
- The `error` row stays when the format has no `{message}` or the logged message differs from the error's.
- File, transport and pino output are untouched.

## Verification

- `__tests__/logger/tty-timestamp.test.ts` stubs `isTTY` and the clock. The TTY case failed before and passes after; the four keep-behavior cases pass on both.
- `__tests__/plugin/single-error-message.test.ts` failed on the 500 and 404 cases before and passes after. Two tests in `handle-http-error.test.ts` that looked for the message in the tree now look for it on the line.
- `bun run typecheck`, `bun x ultracite check` on the changed files, and `bun run build && bun test` pass.

## Out of scope

- A date line when the day changes in a long-running dev server.
