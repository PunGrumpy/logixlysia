# Plan 029: Make the docs, README, agent skill, and AGENTS.md describe the package that actually ships

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 478f40d..HEAD -- apps/docs/content/features/filtering.mdx apps/docs/content/comparison.mdx apps/docs/content/migration-from-evlog.mdx apps/docs/content/introduction.mdx packages/logixlysia/README.md skills/logixlysia/SKILL.md AGENTS.md .vscode/settings.json`
> If any in-scope file changed since this plan was written, re-read it before
> editing. This plan depends on plan 024 having landed (the named
> `logixlysia` export and the `HttpError` export); confirm with
> `grep -n "export { logixlysia }\|export { HttpError }" packages/logixlysia/src/index.ts` → two matches. If not, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/024-export-http-error-and-lock-api-surface.md (merged)
- **Category**: docs (+ dx)
- **Planned at**: commit `478f40d`, 2026-09-19

## Why this matters

Three feature releases (nine adapters, sampling/enrichers/structured errors/typed fields, neural redaction) shipped without the top-of-funnel docs catching up. Verified against the code:

- `features/filtering.mdx` documents `logFilter.status`, `logFilter.method` and `logFilter: null` — none exist; `LogFilter` has only `level`. This page is the only reference for `logFilter` and it is wrong.
- `comparison.mdx` still tells readers to consider evlog for "managed drains (Axiom, etc.)" — logixlysia now ships nine of those. It has no rows for adapters, sampling, enrichers, or structured errors.
- `migration-from-evlog.mdx` maps evlog drains to a hand-written transport object instead of the matching adapter, and has no sections for sampling, enrichers, or `HttpError`.
- The README (the npm landing page) is four sections long and mentions none of the features since 6.6.
- `skills/logixlysia/SKILL.md` — the file coding agents load to write logixlysia code — uses `ws.data.log` (should be `ws.data.store.logger`), calls `wrapWs(hooks)` without the required `path` argument, claims an `onStop` lifecycle that plan 025 only now adds, and never mentions adapters, sampling, enrichers, `HttpError`, `onError`, or desertant.
- `AGENTS.md` is unedited Ultracite boilerplate (React/Next.js/Svelte advice for a server-side logging library) with none of the repo's verification commands, layout, or changeset convention.
- `.vscode/settings.json` sets Prettier as the default formatter with no `[typescript]` override, so VS Code reformats TypeScript against the Biome standard on save.

## Current state

- `apps/docs/content/features/filtering.mdx` (62 lines) — sections "Basic Usage", "By Log Level", "By HTTP Status", "By HTTP Method", "Combined Filters", and a `logFilter: null` example. Truth: `packages/logixlysia/src/types/config.ts:32–38`:

  ```ts
  export interface LogFilter {
    /** Array of log levels to allow. If specified, only logs with these levels will be processed. If not specified, all log levels will be allowed. */
    level?: LogLevel[]
  }
  ```

  `apps/docs/content/adapters/posthog.mdx:97` links to this page for volume control. `configuration.mdx` never mentions `logFilter`.

- `apps/docs/content/comparison.mdx` — feature matrix rows: Elysia plugin, Pino-backed, Request context accumulation, Single access log per request, File rotation, `autoRedact` PII, WebSocket lifecycle logs, OTel trace correlation, AI usage on access log, Presets. "When to consider evlog" bullets: unified wide-event pipeline with managed drains; `evlog/ai` and auth integrations.

- `apps/docs/content/migration-from-evlog.mdx` — sections: Plugin setup, Context accumulation, Emitting the request log, AI metrics, Tracing, Drains vs transports (hand-written `{ log: (level, message, meta) => myDrain.write(...) }`).

- `packages/logixlysia/README.md` (symlinked from repo root) — Installation, Usage (one config example), Documentation link, License. Line 17: `import logixlysia from 'logixlysia' // or import { logixlysia } from 'logixlysia'` (true only after plan 024).

- `apps/docs/content/introduction.mdx:11–17` — six generic feature bullets.

- `skills/logixlysia/SKILL.md` (149 lines): sections 1 Installation (named import at line 18), 2 Request-Scoped Logging, 3 Configuration Options, 4 AsyncLocalStorage, 5 WebSocket (lines 108–133 — `logger.wrapWs({ open(ws) { ws.data.log.info(...) } ... close(ws, code, reason) {...} })`), 6 Code Standards (item 4 at line 149 mentions `onStop`). Truth: `createWsHandlerWrapper` returns `(path: string, hooks) => hooks` (`src/websocket/wrap-ws.ts:63–70`); `WebSocketLike.data` is `{ store?: { logger?: Logger } }` (`wrap-ws.ts:4–7`); the docs page `features/websocket.mdx:47` uses `ws.data.store.logger`.

- Package exports (`packages/logixlysia/package.json`): `.`, `./otel`, `./enrichers`, `./ai`, `./axiom`, `./hyperdx`, `./sentry`, `./posthog`, `./otlp`, `./datadog`, `./better-stack`, `./loki`, `./clickhouse`, `./desertant`.

- `AGENTS.md` — the Ultracite preset text only (Quick Reference, Core Principles incl. React/Next.js/Solid sections, Testing, When Biome Can't Help).

- `.github/CONTRIBUTING.md` — has the monorepo layout and commands (but names them `bun lint`/`bun format`; the real scripts are `bun run lint` / `bun run format`).

- Verified commands at HEAD: `bun run typecheck`, `bun run lint`, `bun run format`, `cd packages/logixlysia && bun test`, `bun run build`, `bun run bench`. Changeset convention: `.changeset/<slug>.md` with `'logixlysia': patch|minor`.

- `.vscode/settings.json:1–10`:

  ```json
  {
    "typescript.tsdk": "node_modules/typescript/lib",
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.formatOnPaste": true,
    "emmet.showExpandedAbbreviation": "never",
    "editor.codeActionsOnSave": {
      "source.fixAll.biome": "explicit",
      "source.organizeImports.biome": "explicit"
    },
  ```

  followed by per-language blocks for css, postcss, graphql, html, javascriptreact, markdown, mdx, svelte, vue, yaml, astro — no `[typescript]`/`[typescriptreact]`/`[json]`/`[jsonc]`. `.zed/settings.json` already routes JavaScript/TypeScript/TSX to Biome.

Docs conventions: MDX with `title`/`description` frontmatter; internal links like `/docs/adapters/overview`; tables for matrices; code fences with `ts`. Nav is defined in `apps/docs/content/meta.ts` and `*/meta.ts` — this plan adds no pages, so no nav edits.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint (checks md/mdx formatting too where Biome applies) | `bun run lint` | exit 0 |
| Format | `bun run format` | exit 0 |
| Docs build (proves MDX parses) | `cd apps/docs && bun run build` | exit 0 (may take a minute; if it needs env vars, see STOP conditions) |
| Docs dev (optional visual check) | `cd apps/docs && bun run dev` | serves on localhost:3000 |
| Grep truth checks | see each step | |

## Scope

**In scope**:

- `apps/docs/content/features/filtering.mdx`
- `apps/docs/content/comparison.mdx`
- `apps/docs/content/migration-from-evlog.mdx`
- `apps/docs/content/introduction.mdx`
- `apps/docs/content/configuration.mdx` (add a `logFilter` entry)
- `packages/logixlysia/README.md`
- `skills/logixlysia/SKILL.md`
- `AGENTS.md`
- `.github/CONTRIBUTING.md` (command names only)
- `.vscode/settings.json`
- `plans/README.md`

**Out of scope**:

- Any source file under `packages/logixlysia/src` — this plan changes no behaviour. If a doc claim can only be made true by changing code, document the current behaviour instead and note it in the report.
- Adapter pages, `api-reference.mdx` (plan 024 added the import line), `features/transports.mdx`, `adapters/overview.mdx` (plan 025 edits the shutdown section).
- Adding new docs pages or nav entries.
- The playground (`apps/elysia`) — demo routes for new features are a separate, optional follow-up.

## Git workflow

- Branch: `improve/029-docs-accuracy` off `main`, after plan 024 merged.
- Conventional commits: `docs(filtering): remove fields that do not exist`, `docs(comparison): reflect adapters, sampling, enrichers and structured errors`, `docs(readme): list current features`, `docs(skill): fix broken examples and cover the current API`, `docs(agents): repo-specific instructions`, `chore(vscode): use Biome for TypeScript`.
- No `Co-Authored-By: Claude` trailer.
- No changeset for docs/skill/AGENTS/vscode changes. The README lives inside `packages/logixlysia/` and is published, so add a **patch** changeset `.changeset/readme-features.md` ("README: document adapters, sampling, enrichers, redaction and structured errors").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `features/filtering.mdx` — delete fiction, point at what exists

Rewrite the page to: level filtering only (keep the `level` example and the available levels list); a short "Reducing volume" section linking to `/docs/features/sampling` (head/tail sampling) and noting that path-based include/exclude is not currently available; remove the `status`, `method`, combined, and `null` sections. Update the description frontmatter to "Filter logs by level".

Add a `### logFilter` entry to `configuration.mdx` next to `sampling` with type `{ level?: LogLevel[] }` and default "all levels".

**Verify**: `grep -n "status\|method" apps/docs/content/features/filtering.mdx` → no matches referring to `logFilter` fields; `grep -n "logFilter" apps/docs/content/configuration.mdx` → ≥ 1.

### Step 2: `comparison.mdx`

- Add matrix rows: "Built-in destinations" (Logixlysia: 9 adapters — Axiom, Better Stack, ClickHouse, Datadog, HyperDX, Loki, OTLP, PostHog, Sentry; evlog: its adapters; bogeychan: manual), "Head + tail sampling" (Yes / Yes / No), "Enrichers" (Built-in + custom / Yes / Manual), "Structured errors (`why`/`fix`)" (`HttpError` / `createError` / No), "Neural PII redaction" (`logixlysia/desertant` / — / —).
- Rewrite "When to consider evlog" to what evlog still offers that logixlysia does not: multi-framework reach (Nuxt/Nitro/Next/Hono/…), a CLI and observability scoring, error catalogs, client/browser logging. Remove the "managed drains" bullet.
- Keep the benchmark section.

**Verify**: `grep -n "managed drains" apps/docs/content/comparison.mdx` → no match; `grep -c "logixlysia/" apps/docs/content/comparison.mdx` → ≥ 2.

### Step 3: `migration-from-evlog.mdx`

- Replace "Drains vs transports" with a table: evlog drain → logixlysia adapter (`evlog/axiom` → `createAxiomTransport()` from `logixlysia/axiom`, and so on for the nine), plus the custom-transport fallback for anything else.
- Add sections: "Sampling" (`evlog` `sampling.rates` → `config.sampling.head`; evlog tail `keep` → `config.sampling.tail` rules, noting there is no predicate form), "Enrichers" (`config.enrichers` with `logixlysia/enrichers` built-ins), "Structured errors" (`createError({ why, fix })` → `new HttpError(status, message, { code, why, fix, link, internal })` with `import { HttpError } from 'logixlysia'`).
- Update the context-accumulation table: prefer the derived `log` (`({ log }) => log.mergeContext(...)`) over `store.logger.mergeContext(request, ...)`, keeping the latter as the alternative.

**Verify**: `grep -n "createAxiomTransport\|HttpError\|sampling" apps/docs/content/migration-from-evlog.mdx` → all three present.

### Step 4: README and introduction

`packages/logixlysia/README.md`: keep the existing Installation/Usage; add a "Features" section with one line each: request-scoped logging and context tree; presets; file logging with rotation; nine built-in destinations (link `/docs/adapters/overview`); head + tail sampling; enrichers; `autoRedact` and `logixlysia/desertant`; structured `HttpError`; request IDs; OpenTelemetry and AI-metrics integrations; WebSocket lifecycle logs. Each line links to the docs site page. Keep it under ~40 added lines. Keep line 17 as is (the named export exists after plan 024).

`apps/docs/content/introduction.mdx`: replace the six generic bullets with the same list (docs-relative links).

**Verify**: `grep -c "logixlysia.vercel.app/docs\|/docs/" packages/logixlysia/README.md` → ≥ 8; `bun run lint` → exit 0.

### Step 5: `skills/logixlysia/SKILL.md`

- Line 18 import: keep `import { logixlysia } from 'logixlysia'` only if plan 024's named export is present (it should be); otherwise use the default import.
- Section 5 WebSocket: fix to the real API —

  ```ts
  const plugin = logixlysia()

  const app = new Elysia()
    .use(plugin)
    .ws('/ws', plugin.wrapWs('/ws', {
      open(ws) {
        ws.data.store.logger.info(ws.data.request, 'WebSocket connection opened')
      },
      message(ws, message) {
        ws.data.store.logger.info(ws.data.request, 'Message received', { payload: message })
      },
      close(ws) {
        ws.data.store.logger.info(ws.data.request, 'WebSocket closed')
      }
    }))
  ```

  Cross-check the exact shape against `apps/docs/content/features/websocket.mdx` and `apps/elysia/src/index.ts` (the playground has a `wrapWs` demo) and use whichever compiles there. Note that the wrapper logs open/message/close itself, so user hooks are optional.
- Section 6 item 4: replace the `onStop` claim with "The plugin flushes transports and the file sink on `app.stop()` (bounded by `config.flushTimeoutMs`); for scripts call `flushLogixlysia(options)`" **only if plan 025 has merged** (`grep -n onStop packages/logixlysia/src/index.ts`). Otherwise delete the item.
- Add sections: "7. Destinations" (import `createXTransport` from `logixlysia/<name>`, `transports: [...]`, `useTransportsOnly`, `onError`), "8. Sampling" (`head` percentages per level, `tail: { status, durationMs, paths }`), "9. Enrichers" (`logixlysia/enrichers` built-ins `traceparentEnricher`, `userAgentEnricher`, `geoEnricher`, `sizeEnricher` — verify the exact export names with `grep -n "^export const" packages/logixlysia/src/enrichers.ts`; custom enricher shape), "10. Structured errors" (`HttpError` fields), "11. Typed fields" (`logixlysia<MyFields>()` and `useLogger<MyFields>()`), "12. Neural redaction" (two-line `withRedaction` example from `src/desertant.ts`'s doc comment).
- Add a maintenance line at the top: "Keep in sync with `packages/logixlysia/package.json#exports`."

**Verify**: `grep -n "ws.data.log\b" skills/logixlysia/SKILL.md` → no match; `grep -c "logixlysia/" skills/logixlysia/SKILL.md` → ≥ 6; every `import ... from 'logixlysia...'` line in the file names a subpath present in `package.json#exports`.

### Step 6: `AGENTS.md` and CONTRIBUTING command names

Prepend a repo-specific section to `AGENTS.md` (above the Ultracite text):

```markdown
# Logixlysia — working in this repo

Bun 1.3.14 workspaces + Turborepo. Published package: `packages/logixlysia` (Elysia logging plugin). Other workspaces: `apps/docs` (Blume docs site), `apps/elysia` (playground), `packages/bench` (vitest benchmarks).

## Verify your work

| What | Command | Expect |
|---|---|---|
| Lint + format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | all pass (coverage is on by default) |
| Build | `bun run build` | `dist/` for 14 entries |

Tests live in `packages/logixlysia/__tests__/<area>/*.test.ts` (`bun:test`; helpers in `__tests__/_helpers/`). Any change under `packages/logixlysia/` needs a changeset: `.changeset/<slug>.md` with `'logixlysia': patch|minor`. Conventional commits (`fix(output): …`). Public API changes must update the API snapshot (`bun test --update-snapshots __tests__/api`). Improvement plans live in `plans/`.
```

Then trim the Ultracite section: delete the "React & JSX", "Framework-Specific Guidance" and "Performance → Next.js `<Image>`" bullets that cannot apply here; keep the rest.

In `.github/CONTRIBUTING.md`, replace `bun lint` → `bun run lint`, `bun format` → `bun run format`, `bun typecheck` → `bun run typecheck` (leave `bun test`, which works).

**Verify**: `grep -n "bun run lint\|bun run typecheck" AGENTS.md` → both present; `grep -n "className\|next/head" AGENTS.md` → no match; `grep -n "bun lint\b" .github/CONTRIBUTING.md` → no match.

### Step 7: `.vscode/settings.json`

Change `"editor.defaultFormatter"` to `"biomejs.biome"` and add explicit blocks:

```json
  "[typescript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[typescriptreact]": { "editor.defaultFormatter": "biomejs.biome" },
  "[javascript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[json]": { "editor.defaultFormatter": "biomejs.biome" },
  "[jsonc]": { "editor.defaultFormatter": "biomejs.biome" },
```

Leave the existing css/markdown/mdx/astro/etc. blocks that point at Prettier (Biome does not format those).

**Verify**: `bun run lint` → exit 0 (the file is JSON with comments allowed; Biome parses `.vscode/settings.json` as JSONC).

### Step 8: Docs build, format, full gate

**Verify**: `cd apps/docs && bun run build` → exit 0 (if the build requires env vars or network for the Blume theme, run `bun run lint` at the root instead and note the skipped build in the report). `bun run format && bun run lint` → exit 0.

## Test plan

No code changes; verification is the grep checks above plus the docs build. A reviewer should open the rendered filtering, comparison, and migration pages.

## Done criteria

- [ ] All grep verifications in Steps 1–7 pass
- [ ] `bun run lint` exits 0
- [ ] `cd apps/docs && bun run build` exits 0 (or its skip is reported with the reason)
- [ ] `.changeset/readme-features.md` exists
- [ ] `git status` shows changes only in the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 024 is not merged (no named `logixlysia` export / no `HttpError` export).
- A claim you are asked to write cannot be verified against the source (e.g. an enricher export name differs) — use the real name; if the feature does not exist, do not document it, and report.
- The docs build fails for a reason unrelated to your edits (e.g. missing env) — report and skip, do not "fix" the build.

## Maintenance notes

- Every feature PR should touch `README.md` Features, `comparison.mdx`, and `SKILL.md`; the executor of plan 024's snapshot test will notice new subpaths, but prose does not fail CI. Consider a checklist item in `.github/pull_request_template.md` ("Docs, README and SKILL.md updated for user-facing changes") — out of scope here, worth a one-line follow-up.
- Direction backlog (see `plans/README.md`) includes "route include/exclude for the access log"; when it lands, `filtering.mdx` is the page to extend.
