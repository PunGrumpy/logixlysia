# Plan 167: The comparison page states the other library's redaction and framework coverage as they are today

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. Do not edit `plans/README.md`; the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6a516de2..HEAD -- apps/docs/content/comparison.mdx` If the file changed, compare the excerpts below with the live file; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `6a516de2`, 2026-11-28

## Why this matters

`apps/docs/content/comparison.mdx` is the one page (with the migration page) where this project describes evlog. Two of its statements are out of date, and a comparison page that undersells the other library costs the reader's trust in the rest of it. Checked on 2026-11-28 against evlog's README (`packages/evlog/README.md` on its `main` branch) and its redaction page (`https://www.evlog.dev/learn/redaction`):

1. The table row `autoRedact` PII says `Varies` for evlog. evlog has built-in redaction that is on by default when `NODE_ENV` is `production`: it masks by key name (keys ending in `password`, `passwd`, `secret` or `token`) and by value (credit cards, emails, IPv4 addresses, phone numbers, JWTs, bearer tokens, IBANs), with opt-in detectors for API keys, private keys and URL passwords.
2. "When to consider evlog" says it "also covers Nuxt, Nitro, Next.js, and Hono". Its README's framework table lists Nuxt, Next.js, SvelteKit, Nitro, TanStack Start, React Router, NestJS, Express, Hono, Fastify, Elysia, oRPC, Effect (beta) and Cloudflare Workers.

Everything else on the page was checked and stands (13 drain adapters, `evlog/fs`, `evlog/ai`, `createError`, the CLI description).

## Current state

`apps/docs/content/comparison.mdx`, line 15:

```md
| `autoRedact` PII | Yes | Varies | Manual |
```

Line 34:

```md
- You need a logger that spans more than Elysia: evlog also covers Nuxt, Nitro, Next.js, and Hono.
```

Docs voice: short declarative sentences, no em dash, no marketing words. This page and `apps/docs/content/migration-from-evlog.mdx` are the only places in the repository's docs that may name evlog.

## Commands you will need

| Purpose             | Command                                     | Expected |
| ------------------- | ------------------------------------------- | -------- |
| Install             | `bun install --frozen-lockfile` (repo root) | exit 0   |
| Lint + format check | `bun run lint`                              | exit 0   |
| Format              | `bun run format`                            | exit 0   |

`turbo` may append a block to the root `AGENTS.md` when it runs. Never commit that: run `git checkout -- AGENTS.md` before committing.

## Scope

**In scope**: `apps/docs/content/comparison.mdx` only.

**Out of scope**: every other file. No changeset (the `docs` workspace is in the changeset `ignore` list and nothing under `packages/logixlysia/` changes).

## Git workflow

- Work on the branch you were started on (`docs/comparison-page-current`). Do not push, do not open a pull request.
- One commit: `docs(comparison): state the other library's redaction and framework coverage as they are`. Body: one or two sentences saying what was stale. Commit with `git -c commit.gpgsign=false commit`. No `Co-Authored-By`, no "Generated with", no mention of any AI tool or model.

## Steps

### Step 1: Edit the two statements

Replace line 15 with:

```md
| Redaction of secrets and PII | `autoRedact`: by key name, plus `redactPatterns` for values | Built in, on by default in production: by key name and by value (cards, emails, IPs, phone numbers, JWTs, bearer tokens, IBANs) | Manual |
```

Replace line 34 with:

```md
- You need a logger that spans more than Elysia: evlog also covers Nuxt, Next.js, SvelteKit, Nitro, TanStack Start, React Router, NestJS, Express, Hono, Fastify, oRPC, Effect and Cloudflare Workers.
```

Before writing the Logixlysia cell of the redaction row, confirm it against the code: `grep -n "redactPatterns\|autoRedact" packages/logixlysia/src/types/config.ts` must show both options. If `autoRedact` is documented in `apps/docs/content/configuration.mdx` as doing more or less than masking by key name, word the cell to match that page and say so in your report.

**Verify**: `grep -n "Varies" apps/docs/content/comparison.mdx` → no output. `grep -c "Fastify" apps/docs/content/comparison.mdx` → `1`.

### Step 2: Lint

**Verify**: `bun run lint` → exit 0 (run `bun run format` first if the table needs realigning, then check `git diff --stat` still lists only `comparison.mdx`).

## Done criteria

- [ ] `git diff --stat origin/main..HEAD` lists only `apps/docs/content/comparison.mdx`
- [ ] `bun run lint` exits 0
- [ ] `git log origin/main..HEAD --format=%B | grep -ciE 'co-authored|generated with|claude|devin|codex|gpt'` prints `0`
- [ ] `git status --short` is empty

## STOP conditions

- Lines 15 or 34 do not match the excerpts.
- `bun run format` changes files other than `comparison.mdx`.

## Maintenance notes

- The other library ships often; its framework list and redaction defaults should be re-read whenever this page is touched.
