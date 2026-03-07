## Cursor Cloud specific instructions

### Project overview

Logixlysia is a logging plugin for ElysiaJS. It is a Turborepo monorepo managed with **Bun workspaces**. See `.github/CONTRIBUTING.md` for standard development commands (`bun test`, `bun run build`, `bun run lint`, `bun run dev`, etc.).

### Services

| Service | Port | Command | Notes |
|---|---|---|---|
| `logixlysia` (core library) | N/A | `bun run build` / `bun run dev` (watch) | Must be built before example apps work |
| `elysia` (Bun example app) | 3001 | `cd apps/elysia && bun run dev` | Uses `--watch` flag |
| `elysia-node` (Node example app) | 3002 | `cd apps/elysia-node && bun run dev` | Uses `tsx watch` |
| `docs` (Next.js docs site) | 3000 | `cd apps/docs && NEXT_PUBLIC_OPENPANEL_CLIENT_ID=dummy bun run dev` | Requires env var |

All services can also be started simultaneously from root via `bun run dev` (Turborepo runs all `dev` scripts in parallel).

### Gotchas

- The docs app (`apps/docs`) requires `NEXT_PUBLIC_OPENPANEL_CLIENT_ID` to be set (any non-empty string works for local dev, e.g. `dummy`). Without it, both `bun run build` and `bun run dev` will fail with an env validation error from `@t3-oss/env-nextjs`.
- `bun run typecheck` has pre-existing TS errors in `packages/logixlysia/__tests__/logger/create-logger.test.ts` (mock type mismatches with pino). These do not affect `bun test` or `bun run build`.
- Linting uses `ultracite` (Biome wrapper): `bun run lint` to check, `bun run format` to auto-fix.
- No Docker, databases, or external services are needed.
- Requires Bun >= 1.3.8 and Node.js >= 24.
