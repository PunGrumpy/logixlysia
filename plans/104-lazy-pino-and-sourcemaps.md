# Plan 104: load pino on first use and stop shipping inline sourcemaps

## Why this matters

The goal is a logger that beats the reference library on performance. `import logixlysia` plus constructing the plugin spent about 42 ms of CPU loading `pino` and `pino-pretty` (50 modules), although a config without `config.pino` never touches them unless the app reads `store.pino`. `sourcemap: 'inline'` also made the published tarball about three times larger than the code.

## Evidence

All numbers are the built `dist`, fresh process per run, base and candidate alternating, 30 runs each, on a machine at load average 20 to 28. Wall time was distorted by that load (median 393 ms base against 269 ms candidate under Bun), so the decision rests on process CPU time, whose spread stayed within about 10 ms.

- Import plus construct, CPU, Bun 1.3.14: median 120.9 ms to 93.4 ms (range 117 to 129 and 90 to 99). Node 25.9: 213.8 ms to 183.6 ms (range 208 to 222 and 173 to 194).
- Limiter: `require('pino'); require('pino-pretty')` alone costs 41.7 to 45.3 ms under Bun and 35.2 to 40.2 ms under Node (11 runs). The remaining roughly 93 ms is runtime startup, `elysia` and `chalk`, which this plan does not touch.
- Size: `dist` 652,970 B to 178,749 B. `npm pack --dry-run` 232.7 kB to 78.4 kB packed, 728.1 kB to 253.8 kB unpacked. Entries: 16 `dist/*.js`.
- Dropping the sourcemaps did not change import CPU measurably (lazy build with inline maps 93.4 ms, with none 95.7 ms, separate 30 run sets), so that part wins on size only.

## Change

- `src/logger/index.ts` imports the pino types only and loads both modules with `createRequire(import.meta.url)` the first time the real pino is built. The `createRequire` call is synchronous, so `store.pino` stays a synchronous proxy under Bun and Node ESM.
- A config with `config.pino` still builds pino at construction, as before. `createLogger(options, pinoFactory)` keeps its signature; `pinoFactory` is now optional in the declaration.
- `bunup.config.ts` sets `sourcemap: 'none'`. External maps were measured too: Bun emits the `.map` files without a `sourceMappingURL` comment, so no tool finds them, and they would still add about 100 kB packed (external build 178.7 kB against 78.4 kB). No test or script reads a map. A consumer who needs original frames can build from the repository.
- `__tests__/logger/create-logger.test.ts` swaps the cached `pino-pretty` exports instead of `mock.module`, which does not intercept `createRequire`.

## Verification

- `__tests__/logger/lazy-pino.test.ts` runs child processes against `src` under Bun and `dist` under Bun and Node. It asserts `require.cache` holds no `pino` or `pino-pretty` after construction with a default config, that `store.pino.info` still logs synchronously on first use, and that `config.pino` and `prettyPrint` load the modules and log. The three default-config tests failed on the unchanged source and pass now.
- `bun run lint`, `bun run typecheck`, `bun run build` and `bun test` pass. The API snapshot is unchanged.

## Out of scope

- Redaction code, `src/index.ts` behaviour and `packages/bench`.
- The cost of `elysia` and `chalk` imports.
