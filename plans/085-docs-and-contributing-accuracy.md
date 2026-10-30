# Plan 085: Docs, README and contributing guides say what the code does

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e27dd76..HEAD -- apps/docs/content README.md packages/logixlysia/README.md .github/CONTRIBUTING.md apps/elysia/README.md` must print nothing. If a cited line does not read as quoted below, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plans 077, 080, 082 and 084 edit other docs pages; this plan must not touch those pages)
- **Category**: docs
- **Planned at**: commit `e27dd76`, 2026-10-30

## Why this matters

Every config option, default and adapter option in the docs matches the code (the docs typecheck their snippets). What drifted is prose: the comparison page promises "Pino performance" and "Pino-backed: Yes" for a plugin whose request logs never touch pino; the README and intro say request ids are "generated for every request" when the option is off by default; the FAQ tells users to install `pino-pretty`, which is a regular dependency; the contributing guide says `bun test` at the root runs every package, but that bypasses turbo and the coverage gate; two contributing files give different changeset rules and neither matches `AGENTS.md`. A reader choosing a logger or a contributor following the guide gets wrong instructions.

## Current state

Cited lines (open each before editing):

- `apps/docs/content/comparison.mdx:11` `| Pino-backed | Yes | Optional drains | Yes |`; `:28` `- You want **Pino** performance with Elysia-native `store.logger` ergonomics.`
- `apps/docs/content/faq.mdx:10` says the plugin "writes its own request logs and exposes a pino instance as `store.pino`" (correct, keep); `:55` links `/contributing#preview-releases` (missing the `/docs` prefix; other links on the page use `/docs/...`); `:312` `3. You have `pino-pretty` installed if using transport-based pretty printing` (it is in `dependencies` of `packages/logixlysia/package.json`).
- `apps/docs/content/introduction.mdx:20` and `README.md:56` and `packages/logixlysia/README.md` (same feature list; check with `grep -n "generated for every request"`): "Request IDs: read from the incoming request or generated for every request". `requestId` is off by default and on in the `prod` preset (`packages/logixlysia/src/config/resolve-options.ts`, `PRESET_DEFAULTS`).
- `apps/docs/content/integrations/pino.mdx:6` calls Pino "an optional logging backend" (it is an optional extra for the application's own logs; the plugin's lines are not pino-backed).
- `apps/docs/content/features/startup.mdx:29-37` shows a banner with `logixlysia v6.9.4` and port 3001 while the simple format above uses port 3000 and the package is at 6.10.7.
- `apps/docs/content/configuration.mdx:220-240` (`slowThreshold`, `verySlowThreshold`) lack the validation rule the code enforces: both must be finite numbers at or above 0 and `slowThreshold <= verySlowThreshold`, else `resolveOptions` throws `logixlysia: invalid formatting config` (`packages/logixlysia/src/config/resolve-options.ts:117-139`). `configuration.mdx:523-534` and `features/log-rotation.mdx:89` say `maxFiles` is a "number or '7d'"; a number must be a positive integer (`src/types/config.ts`, `maxFiles` doc).
- `apps/elysia/README.md:3` "Node.js compatibility is covered by integration tests" and `:83` "includes a Node adapter smoke test"; the test runs `@elysiajs/node` under `bun:test`, not on the Node runtime.
- `.github/CONTRIBUTING.md:26` and `:115` `bun test` at the root; `:75-80` "When NOT to create a changeset" lists internal refactoring, test updates, build configuration; `:13-17` lists only three workspaces. `apps/docs/content/contributing.mdx:91-100` says a changeset is needed when the change affects the published package. `AGENTS.md` (root) says: any change under `packages/logixlysia/` needs a changeset, tests run with `cd packages/logixlysia && bun test`, lint with `bun run lint`, conventional commits.

## Commands you will need

| Purpose | Command (repo root) | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint / format | `bun run lint`, `bun run format` | exit 0 (covers `.md`/`.mdx` formatting) |
| Typecheck | `bun run typecheck` | exit 0 (docs snippets compile) |

## Scope

**In scope** (only these files):

- `apps/docs/content/comparison.mdx`, `faq.mdx`, `introduction.mdx`, `integrations/pino.mdx`, `features/startup.mdx`, `configuration.mdx` (only the `slowThreshold`, `verySlowThreshold` and `logRotation.maxFiles` sections), `features/log-rotation.mdx`, `contributing.mdx`
- `README.md`, `packages/logixlysia/README.md`
- `apps/elysia/README.md`
- `.github/CONTRIBUTING.md`

**Out of scope**: `adapters/overview.mdx`, `adapters/otlp.mdx`, `adapters/hyperdx.mdx`, `features/enrichers.mdx`, `integrations/otel.mdx`, `integrations/ai.mdx`, `api-reference.mdx`, `features/sampling.mdx`, `features/websocket.mdx` (other plans own them); `AGENTS.md`; any source file; any name of another logging library in `comparison.mdx` (edit the Pino row and the Pino bullet only).

## Git workflow

- Branch `improve/085-docs-accuracy` from `e27dd76`.
- Commits: `docs: correct the pino, request-id and preview-link claims`, `docs(config): state the threshold and maxFiles validation rules`, `docs(contributing): match the verify commands and changeset rule to AGENTS.md`.
- `git -c commit.gpgsign=false commit …`; no trailers. Do not push. No changeset: nothing under `packages/logixlysia/src` changes (the package README is docs).

## Steps

### Step 1: Prose claims

- `comparison.mdx:11`: change the Logixlysia cell to `Own request logger; pino on `store.pino``. `:28`: replace the bullet with `- You want automatic access logs with Elysia-native `store.logger`ergonomics, and a pino instance on`store.pino` for your own logs.`
- `integrations/pino.mdx:6`: say Logixlysia exposes a Pino instance as `store.pino` for the application's own structured logs; the plugin's request lines are written by its own logger.
- `faq.mdx:312`: delete the `pino-pretty` step (renumber). `:55`: link to `/docs/contributing#preview-releases`.
- `introduction.mdx:20`, `README.md:56`, `packages/logixlysia/README.md` (same line): `read from the incoming request or generated, when `requestId`is on (the`prod` preset turns it on)`.
- `features/startup.mdx`: replace `v6.9.4` with `v6.x.y` and port 3001 with 3000 so the two examples agree.
- `apps/elysia/README.md:3` and `:83`: say the integration suite runs the `@elysiajs/node` adapter under Bun's test runner.

**Verify**: `grep -rn "pino-pretty\` installed\|generated for every request\|v6.9.4\|Pino-backed | Yes" apps/docs/content README.md packages/logixlysia/README.md` returns nothing.

### Step 2: Validation rules

- `configuration.mdx` `slowThreshold` and `verySlowThreshold`: add `Must be a finite number at or above 0, and `slowThreshold`must not exceed`verySlowThreshold`; otherwise startup throws `logixlysia: invalid formatting config`.`
- `configuration.mdx` `logRotation.maxFiles` and `features/log-rotation.mdx:89`: `A number must be a positive integer; `0` or a negative value is rejected at startup.` (Confirm the rule in `src/types/config.ts` and `src/config/resolve-options.ts` before writing it; if the code accepts `0`, write what the code does.)

**Verify**: `grep -n "invalid formatting config" apps/docs/content/configuration.mdx` matches; `bun run typecheck` exit 0.

### Step 3: Contributing guides

- `.github/CONTRIBUTING.md`: list all workspaces (`packages/logixlysia`, `packages/bench`, `packages/video`, `packages/typescript-config`, `apps/docs`, `apps/elysia`); replace root `bun test` with `bun run test` (turbo, builds first) and add `cd packages/logixlysia && bun test` for the package (coverage gate on); add the verify table from `AGENTS.md` (lint, format, typecheck, tests, build); state the changeset rule once: any change under `packages/logixlysia/` needs `.changeset/<slug>.md` with `'logixlysia': patch|minor`; mention conventional commits. Delete the "When NOT to create a changeset" list.
- `apps/docs/content/contributing.mdx:91-100`: align the changeset sentence with the same rule and point to the same verify commands; do not duplicate the whole table, link to the GitHub file.

**Verify**: `grep -n "bun test\b" .github/CONTRIBUTING.md` shows only the package-scoped command; `grep -n "When NOT" .github/CONTRIBUTING.md` returns nothing.

### Step 4: Format and checks

`bun run format && bun run lint && bun run typecheck` → exit 0.

## Test plan

No tests; the docs typecheck and lint are the gates.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] The greps in Steps 1 and 3 return as stated
- [ ] No file outside the in-scope list is modified; no changeset added

## STOP conditions

- A cited line does not read as quoted.
- `bun run typecheck` fails on a docs snippet you did not change.
- You would need to edit a page another plan owns (listed under out of scope).

## Maintenance notes

- Reviewer: read the Pino row and bullet for tone; check no other library's name was added or removed; check the `maxFiles` rule matches the code.
- Deferred: a single source for the contributing guide (one file linking to the other) and an "adding an adapter" checklist (index, deferred list).
