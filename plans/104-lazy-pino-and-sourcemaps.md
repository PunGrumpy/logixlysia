# Plan 104: load pino on first use and stop shipping inline sourcemaps

## Why this matters

The goal is a logger that beats the reference library on performance. `import logixlysia` plus constructing the plugin spent about 42 ms of CPU loading `pino` and `pino-pretty` (50 modules), although a config without `config.pino` never touches them unless the app reads `store.pino`. `sourcemap: 'inline'` also made the published tarball about three times larger than the code.

## Evidence

All numbers are the built `dist`, fresh process per run, base and candidate alternating, on a machine at load average 18 to 28. Wall time was distorted by that load, so the decision rests on process CPU time.

- Import plus construct, CPU, 20 runs per side. Bun 1.3.14: median 128.7 ms to 106.3 ms (range 126 to 135 and 104 to 110). Node 25.9: 231.1 ms to 199.8 ms (range 225 to 240 and 195 to 208). Each run also checked `require.cache`: base loads pino at import, the candidate does not.
- Limiter: `require('pino'); require('pino-pretty')` alone costs 41.7 to 45.3 ms under Bun and 35.2 to 40.2 ms under Node (11 runs). The rest is runtime startup, `elysia` and `chalk`.
- Size: `npm pack --dry-run` 232.7 kB to 78.7 kB packed, 728.1 kB to 254.4 kB unpacked.
- Dropping the sourcemaps did not change import CPU measurably, so that part wins on size only.

The first version loaded pino with `createRequire(import.meta.url)`. Bundlers do not follow that call, so `bun build --target=bun`, `bun build --compile` and esbuild bundles dropped pino and failed with `Cannot find package 'pino'` once run away from `node_modules`. Candidates, each built and run from a directory with no `node_modules` above it and with `--no-install`:

- A free `require('pino')` in the source. bunup rewrites it to the same `createRequire` call. Fails like the first version.
- `import.meta.require`. Does not exist under Node ESM. Ruled out.
- `import defer`. A syntax error in Bun 1.3.14 and Node 25.9. Ruled out.
- `typeof require` guarding a literal `require('pino')`, patched into `dist`. Bundles worked, but bunup cannot emit it, and a bundler that leaves `require` alone falls back to `createRequire` and fails at run time. Rejected.
- A CommonJS file, `load-pino.cjs`, that the ESM build imports statically and that calls `require('pino')` inside a function. Bundlers follow a `require` in CommonJS, and it still runs on first call. Passes Bun single file, `--compile`, esbuild for Node and Vite 8 SSR, with a default config and with `prettyPrint`, and stays lazy unbundled under Bun and Node. Chosen.

## Change

- `src/logger/load-pino.cjs` exports `loadPino` and `loadPretty`, typed by `load-pino.d.cts`. `src/logger/index.ts` calls them the first time the real pino is built, so `store.pino` stays a synchronous proxy.
- `bunup.config.ts` keeps `./load-pino.cjs` external and copies it into `dist`. The logger code lives in `dist/index.js`, so the relative specifier resolves. It sets `sourcemap: 'none'`.
- A config with `config.pino` still builds pino at construction. `createLogger(options, pinoFactory)` keeps its signature.
- `__tests__/logger/create-logger.test.ts` swaps the cached `pino-pretty` exports, because `mock.module` does not intercept a CommonJS `require`.

## Verification

- `__tests__/logger/bundled-app.test.ts` bundles a small app from `dist` with `bun build --target=bun`, runs it with `--no-install` from a temp directory where `pino` cannot be resolved, and asserts pino output for a default config and for `prettyPrint`. Both failed with `Cannot find package 'pino'` on the `createRequire` build and pass now. They also pass on main.
- `__tests__/logger/lazy-pino.test.ts` checks that a default config loads neither module, under Bun from `src` and `dist` and under Node from `dist`.
- `bun run lint`, `bun run typecheck`, `bun run build` and `bun test` pass. The API snapshot is unchanged.

## Out of scope

- Redaction code, `src/index.ts` behaviour and `packages/bench`.
- The cost of `elysia` and `chalk` imports.
- `--compile` and esbuild in the test suite. The `bun build` case caught the defect, and the other two were checked by hand.
