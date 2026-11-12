# Plan 111: print the level as a word when colors are off

## Why this matters

On a color terminal the `{icon}` fox sits in a green, yellow, red or blue chip, so the level is visible at a glance. Without colors the chip is gone and every line shows the same `🦊`. In CI, Docker, a piped stdout or with `useColors: false`, a reader could not tell an `ERROR` line from an `INFO` line without reading the status code.

## Evidence

A probe app with `service: 'my-api'` and four routes, run with stdout piped (no TTY), before the change:

```
2026-11-12T06:10:40.737Z [my-api] 🦊 GET     /ok 200 5ms
2026-11-12T06:10:40.738Z [my-api] 🦊 GET     /warn 200 0.33ms cache miss
2026-11-12T06:10:40.740Z [my-api] 🦊 GET     /boom 500 1ms Payment failed
```

`useColors: false` on a pseudo-terminal printed the same three prefixes. `getLevelIcon` in `src/logger/create-logger.ts` returned `'🦊'` for every level when `useColors` was false.

## Change

- `getLevelIcon` returns the level word when colors are off: `DEBUG`, `INFO `, `WARN `, `ERROR`. Each is padded to five characters so the method column lines up, as `{method}` is padded to seven.
- "Colors off" is the existing decision in `shouldUseColors`: `useColors: false`, or stdout is not a TTY. Nothing else reads it differently.
- `WARNING` prints as `WARN` to keep the column five wide. The `{level}` token still prints `WARNING`.

After, same probe and pipe:

```
2026-11-12T06:11:32.528Z [my-api] INFO  GET     /ok 200 8ms
2026-11-12T06:11:32.529Z [my-api] WARN  GET     /warn 200 0.28ms cache miss
2026-11-12T06:11:32.530Z [my-api] ERROR GET     /boom 500 1ms Payment failed
```

## What stays the same

- With colors on a TTY the line is byte-for-byte the same: the fox in a level-colored chip.
- `{level}`, file output, transports and pino output are untouched.

## Verification

- `__tests__/logger/level-word.test.ts` drives `createLogger` with stdout's `isTTY` stubbed. All six cases failed before the change (each line carried `🦊`) and pass after.
- `bun run typecheck`, `bun x ultracite check` on the changed files, and `bun run build && bun test` pass.

## Out of scope

- `NO_COLOR`. `shouldUseColors` does not read it and chalk does not either: on a pseudo-terminal with `NO_COLOR=1` the probe prints full ANSI color. Honoring it changes every colored token, not only the level, so it is its own change.
- The startup banner fox.
