# Plan 113: context depth 2 by default, long strings cut on a terminal

## Why this matters

`log.mergeContext({ user: { id, org } })` printed the whole `user` as one JSON blob, because `contextDepth` defaulted to `1`. A reader had to scan the JSON for `id`. A long string, such as a note or a prompt, ran across several terminal rows and pushed the next request off screen.

## Evidence

`buildContextTreeLines` in `src/logger/create-logger.ts` read `options.config?.contextDepth ?? 1`. A probe app logged a 304-character `note` and a nested `user`, run on a pseudo-terminal (`script -qc`) before the change:

```
06:18:02.051 [my-api] INFO  GET     /ctx 200 0.40ms
  ├─ note  customer asked to split the shipment across two warehouses across two warehouses […all 304 characters…] end
  └─ user  {"id":"usr_123","org":{"id":"org_9","plan":{"tier":"pro"}}}
```

## Change

- `DEFAULT_CONTEXT_DEPTH = 2`. An explicit `contextDepth` still wins.
- `MAX_TTY_VALUE_LENGTH = 200`. When stdout is a TTY, a string value in the context tree longer than that prints its first 200 characters, then `… (<length> chars)` with the length of the logged string.

After, same probe and terminal:

```
06:17:55.092 [my-api] INFO  GET     /ctx 200 0.40ms
  ├─ note  customer asked to split the shipment across two warehouses […200 characters…] across tw… (304 chars)
  ├─ user.id  usr_123
  └─ user.org  {"id":"org_9","plan":{"tier":"pro"}}
```

## What stays the same

- Piped stdout prints the whole string. File and transport output never pass through the console formatter, so neither truncates.
- Non-string values, JSON for objects past the depth, and the error rows are not cut.
- The pre-existing 2048-character safety cap in `sanitizeLogText` applies everywhere, as before.

## Verification

- `__tests__/logger/context-tree-defaults.test.ts` stubs `isTTY`. The default-depth and TTY-truncation cases failed before and pass after. The explicit-depth, 200-character, non-TTY and transport cases pass on both.
- `bun run typecheck`, `bun x ultracite check` on the changed files, and `bun run build && bun test` pass. The API snapshot did not change; only the `contextDepth` JSDoc default moved from 1 to 2.

## Out of scope

- Cutting long JSON values or error messages.
- A config option for the 200-character limit.
