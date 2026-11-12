# Plan 105: `log` reaches apps that mount logixlysia through a setup plugin

## Why this matters

Sharing plugins through one named setup plugin is the standard Elysia pattern. With logixlysia inside it, `log` in the consuming app's handlers is `undefined` at runtime while TypeScript says it exists, so the first `log.info` turns the request into a 500.

## Evidence

- Bun 1.3.14, Elysia 1.4.30. `new Elysia().use(new Elysia({ name: 'setup' }).use(logixlysia())).get('/', ({ log }) => log.info('hi'))` answers 500 with `undefined is not an object (evaluating 'log.info')`.
- The per-request `log` comes from a `derive` with no scope, and the plugin ends with `.as('scoped')`. A scoped hook is applied to the instance that `.use()`s the plugin and becomes local there, so it never reaches that instance's parent.
- Making that derive global breaks `each sibling module logs its own routes through its own instance`. Elysia stamps every hook of a named instance with `checksum(name + seed)`, and `mergeObjectArray` drops an incoming hook whose checksum is already present. Every logixlysia instance is named `Logixlysia` with no seed, so a global derive from the first instance makes Elysia drop every later instance's own derive.

## Change

`packages/logixlysia/src/index.ts`: the plugin now also uses an inner plugin named `Logixlysia/log` with a global derive of `log`. Its own name gives it a different checksum, so it dedupes only against other instances' copies, and the first instance's copy gives `log` to every route. The existing scoped derive is unchanged and runs after it, so a module that mounts its own instance still gets that instance's `log`.

`apps/docs/content/usage.mdx`: one sentence on how far `log` reaches.

## Verification

- `__tests__/plugin/setup-plugin.test.ts`: setup plugin one level up, two levels up, `group` and `guard` routes, `onError`, `ws.data.log`, and one access line per request. Five fail on unchanged source and all six pass after the change.
- `bun run lint`, `bun run typecheck`, `cd packages/logixlysia && bun run build && bun test` all pass (993 tests).

## Out of scope

- Later instances' `onRequest` still not running (documented in usage.mdx). A per-instance seed would change that and the wrap dedupe with it.
- `useLogger()` without `useAsyncLocalStorage`.
