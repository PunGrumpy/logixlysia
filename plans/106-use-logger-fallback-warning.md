# Plan 106: `useLogger()` says why it lost request context

## Why this matters

Without `useAsyncLocalStorage: true`, `useLogger()` returns a logger whose methods write nothing. A service that calls it loses its request id and fields with no hint of the cause. The developer sees missing logs and has to find the option in the docs. One stderr line naming the option removes that search.

## Evidence

- `src/context/storage.ts` returned `loggerStorage.getStore() ?? noopRequestLogger` with no signal. Measured: a plugin without the option, two requests and one call outside a request produced no stderr output.
- With the option on, every request has a store, so a missing store means a call outside a request. The code cannot tell that apart from a misconfiguration when a plugin with the option exists, so the warning needs both facts below.
- The source has no `NODE_ENV` check and no one-time warning helper. Sink failures use `console.error` with a `[logixlysia]` prefix, which this change follows.

## Change

- `storage.ts` records whether any plugin was created with and without the option (`recordStorageMode`, called once per plugin from `index.ts`).
- On a call with no store, `useLogger()` warns when a plugin without the option exists, no plugin with the option exists, `NODE_ENV` is not `production`, and no warning was printed yet. The warning is `console.warn`, once per process.
- Docs: `request-context.mdx`, `configuration.mdx` and `skills/logixlysia/SKILL.md` mention the warning.

## Verification

- `__tests__/context/use-logger-fallback-warning.test.ts` runs a real app in a child process and reads stderr. It failed against the unchanged source (expected 1 warning, received 0) and passes now.
- Cases: warns once across several calls, silent with the option on, silent in production, silent with no plugin.
- `bun run lint`, `bun run typecheck`, `bun run build && bun test`.

## Out of scope

- The `derive` and scoping code in `index.ts`.
- Warning when a plugin with the option exists in the same process as one without. The call site is ambiguous, so it stays silent.
- A config switch to silence the warning.
