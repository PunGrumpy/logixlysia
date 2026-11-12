# Plan 107: show `error.cause` in the console output

## Why this matters

`throw new Error('order failed', { cause: dbError })` is the standard way to wrap a failure, and the cause is usually the real reason. The pretty console output printed the top error only, so a developer reading the terminal saw "order failed" and had to find the cause elsewhere. Transports already carry it as `meta.error.cause`.

## Evidence

- Side-by-side capture `lx.tty-NO_COLOR.c120.as-seen.txt`, scenario "500 with cause": the tree has `error` and `error.at` and no cause.
- `normalizeLoggedError` keeps `cause` up to three levels and cuts cycles by that cap, so the data reaches the console formatter intact.
- Before the change, seven new tests in `__tests__/plugin/error-cause.test.ts` failed. After it, all pass.

## Change

- `collectStructuredErrorEntries` in `src/logger/create-logger.ts` appends the chain from a new `collectCauseEntries`.
- Each cause is a tree entry `Caused by: <name>: <message>`, one indent step deeper per level, up to 3 levels. A cause already shown ends the walk.
- A cause with a stack gets an `at <file>:<line>:<column>` entry, by the rule the top error's `error.at` uses.
- A non-Error cause goes through `stringifyTreeValue`, the formatter other logged values use.
- Redaction is unchanged. It runs on the log data before formatting and already walks `cause`.
- No new option. Docs: `apps/docs/content/features/formatting.mdx`.

## Verification

- `cd packages/logixlysia && bun test __tests__/plugin/error-cause.test.ts` passes.
- `bun run lint`, `bun run typecheck`, and `bun run build && bun test` pass.
- Run a route that throws a three-deep chain on a piped stdout and a pseudo-terminal. Both print the same text.

## Out of scope

- `code`, `why`, `fix` and `link` on a cause. Only the top error prints them.
- Structured, pino, file and transport outputs. They already carry the cause.
- Timestamps and level labels in the console.
