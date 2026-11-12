# Plan 109: README and docs show what the package prints

## Why this matters

The maintainer wants logixlysia to beat the reference library on developer experience. A new user's first five minutes are the README and the docs landing pages. The README quick start never shows `({ log })`, the main way to log from a handler. The home-page terminal demo and one formatting example print lines the package no longer produces. Usage sits seventh in the sidebar, after pages a newcomer does not need yet. Nothing links the agent skill at `skills/logixlysia/SKILL.md`.

## Evidence

Each output below came from running the package source on Bun 1.3.14 with piped stdout (no ANSI codes).

- `demo.astro`: the 404 line prints `NOT_FOUND` as its message and an `error` and `error.code` tree. The 500 line prints `Route crashed` as its message and an `error` and `error.at` tree. The demo showed neither. The banner said `Elysia v1.4.28` and `logixlysia v6.6.0`. The package prints `v1.4.30` and `v6.13.0`. The slow line has two spaces before `⚡ slow` because the message is empty.
- `features/formatting.mdx`: the `{service}{icon}` example showed `[my-api]🦊`. The package prints `[my-api] 🦊`.
- `packages/logixlysia/README.md` (the root `README.md` is a symlink to it) has no `log` example. It ships in the npm package.
- `meta.ts` listed `usage` after `contributing`.
- The minimal formatting example and the context tree example already match real output.

## Change

- README: a minimal app with `log.mergeContext` in a handler, the two lines it prints, the existing example under a `Configuration` heading, and a link to the agent skill.
- `demo.astro`: banner versions, the 404 and 500 rows (static and interactive), and the slow-line spacing.
- `formatting.mdx`: the missing space after `[my-api]`.
- `meta.ts`: `usage` directly after `introduction`. No page file moves, so no URL changes.
- A `patch` changeset, because the README ships in the package.

## Verification

- `bun run lint`
- `bun run typecheck`, which compiles the docs code blocks
- `bun run build` in `apps/docs`, if it runs offline

## Out of scope

File-logging docs, preset docs and error-cause examples. Open pull requests change that output. Console examples stay at one or two lines for the same reason.
