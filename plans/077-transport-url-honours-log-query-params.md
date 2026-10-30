# Plan 077: Transports get the request URL without its query string unless `logQueryParams` is on

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e27dd76..HEAD -- packages/logixlysia/src/output/index.ts packages/logixlysia/__tests__/output/transports.test.ts` must print nothing (you branch from `e27dd76`, so it will). If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e27dd76`, 2026-10-30

## Why this matters

`logQueryParams` is documented as "Include query parameters in the logged URL path", default `false`, and the console and file sinks honour it. The transport record does not: `meta.request.url` is the raw `request.url`, query string included. So an OAuth `code`, a signed-URL `X-Amz-Signature`, a magic-link token or an `email` parameter goes to Datadog, Axiom, Sentry and every other adapter while the local sinks drop it, and the operator who read the option believes the query is not logged. `autoRedact` masks only the handful of parameter names in `src/utils/redact.ts` (`apikey`, `access_token`, `client_secret`, `jwt`, …); `code`, `state`, `sig`, `signature`, `otp` and friends stay visible. This plan makes the transport URL follow the same switch as the other sinks.

## Current state

- `packages/logixlysia/src/output/index.ts` builds the transport record. Lines 61-69:

```ts
const message = typeof data.message === 'string' ? data.message : ''
const meta: Record<string, unknown> = {
  request: {
    method: request.method,
    url: request.url
  },
  ...data,
  durationMs: precomputed.durationMs
}
```

`options.config?.logQueryParams` is never read in this file. `precomputed` is a `PrecomputedLogParts` (`{ durationMs, pathname, search }` from `src/logger/create-logger.ts:472-476`), but `pathname` and `search` are `''` when only transports are configured (`src/logger/emit.ts:44`, `needsUrlParts = hasFileLogging || hasInternalLogger`). Do not change `resolveSinks`; strip the string instead.

- The two sinks that already honour the option: `src/output/file.ts:26-29` (`resolvePathname`) and `src/logger/create-logger.ts:521-524`.
- `src/types/config.ts:140-144` documents the option:

```ts
  /** Include query parameters in the logged URL path. Default: false. */
  logQueryParams?: boolean
```

(Open the file; the exact doc line may be worded slightly differently. Keep whatever is there, and append one sentence saying the switch also governs the `request.url` transports receive.)

- `apps/docs/content/adapters/overview.mdx:163` says each log carries "the request method and URL". `apps/docs/content/configuration.mdx` has a `### logQueryParams` section (find it with `grep -n logQueryParams`).
- Test exemplar: `packages/logixlysia/__tests__/output/transports.test.ts`. Its first test builds `options`, a `createMockRequest('http://localhost/hello')`, calls `logToTransports({...})` and asserts `req?.url` at line 56. Model the new tests on it.

Repo conventions: Ultracite (oxlint + oxfmt) formatting, `bun run format` fixes it. No comments that narrate steps. Tests use `bun:test` with `describe`/`test`.

## Commands you will need

| Purpose | Command (from the repo root unless noted) | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| One test file | `cd packages/logixlysia && bun test __tests__/output/transports.test.ts` | pass |
| All tests | `cd packages/logixlysia && bun test` | all pass (758 at baseline) |

A fresh worktree has no `node_modules`; run the install first.

## Scope

**In scope** (the only files you should modify):

- `packages/logixlysia/src/output/index.ts`
- `packages/logixlysia/src/types/config.ts` (one doc sentence on `logQueryParams`)
- `packages/logixlysia/__tests__/output/transports.test.ts`
- `apps/docs/content/adapters/overview.mdx` (one sentence at line 163)
- `apps/docs/content/configuration.mdx` (one sentence under `logQueryParams`)
- `.changeset/transport-url-query-params.md` (create)

**Out of scope** (do NOT touch):

- `src/logger/emit.ts`, `src/logger/create-logger.ts`, `src/output/file.ts`: the other sinks already behave correctly.
- `src/utils/redact.ts`: widening the sensitive-key list is a separate decision.
- Adapter files under `src/*.ts`: they receive `meta` and must not strip anything themselves.

## Git workflow

- Branch: `improve/077-transport-url-query-params` from `e27dd76`.
- Conventional commits, for example `fix(output): strip the query string from the transport URL unless logQueryParams is on`. No `Co-Authored-By` trailer, no generated-by line.
- Commit with `git -c commit.gpgsign=false commit …` (no signing key in this environment).
- Do not push and do not open a PR; the reviewer does that.

## Steps

### Step 1: Write the failing tests

In `__tests__/output/transports.test.ts` add three tests inside the existing `describe('logToTransports', …)`:

1. `strips the query string and fragment from request.url by default`: request `http://localhost/login?code=abc&state=xyz#frag`, config with one mock transport and no `logQueryParams`; assert `meta.request.url === 'http://localhost/login'`.
2. `keeps the query string when logQueryParams is true`: same request, `logQueryParams: true`; assert `meta.request.url === 'http://localhost/login?code=abc&state=xyz'`.
3. `leaves a URL without a query string untouched`: request `http://localhost/hello`; assert `meta.request.url === 'http://localhost/hello'` and that it is the same string Bun returned from `request.url` (no re-serialisation).

**Verify**: `cd packages/logixlysia && bun test __tests__/output/transports.test.ts` → the first two new tests fail, the third passes.

### Step 2: Strip the query in `logToTransports`

In `src/output/index.ts`, add a small pure helper above `logToTransports`:

```ts
const withoutQuery = (url: string): string => {
  const query = url.indexOf('?')
  const fragment = url.indexOf('#')
  const end =
    query === -1
      ? fragment
      : fragment === -1
        ? query
        : Math.min(query, fragment)
  return end === -1 ? url : url.slice(0, end)
}
```

(Restructure to satisfy the lint rule against nested ternaries if `bun run lint` complains; two `if` statements are fine.) Then build the record with:

```ts
url: options.config?.logQueryParams ? request.url : withoutQuery(request.url)
```

Keep the field name `url` and keep `method` as is. Do not parse with `new URL` (it allocates per record and the string op is enough).

**Verify**: `cd packages/logixlysia && bun test __tests__/output/transports.test.ts` → all pass, including the three new ones.

### Step 3: Document the switch

- `src/types/config.ts`: append to the `logQueryParams` doc comment: "Also governs the `request.url` handed to transports."
- `apps/docs/content/adapters/overview.mdx:163`: after "the request method and URL" add "(the URL without its query string unless `logQueryParams` is `true`)".
- `apps/docs/content/configuration.mdx`, `logQueryParams` section: add one sentence: "Applies to the console path, the file path and the `request.url` transports receive."

**Verify**: `grep -n "logQueryParams" apps/docs/content/adapters/overview.mdx apps/docs/content/configuration.mdx packages/logixlysia/src/types/config.ts` shows the three additions.

### Step 4: Changeset, lint, full suite

Create `.changeset/transport-url-query-params.md`:

```md
---
'logixlysia': patch
---

Transports now receive the request URL without its query string unless `logQueryParams` is `true`, the same rule the console and file sinks already follow. Before, query parameters such as OAuth codes and signed-URL tokens reached every adapter even with the option off.
```

**Verify**: `bun run format && bun run lint && bun run typecheck` → exit 0. `cd packages/logixlysia && bun test` → all pass (761 expected: 758 + 3).

## Test plan

- The three tests in Step 1, in `__tests__/output/transports.test.ts`, modelled on its first test.
- Verification: `cd packages/logixlysia && bun test` → all pass.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun test` exits 0 with 3 new tests
- [ ] `grep -n "url: request.url" packages/logixlysia/src/output/index.ts` returns no match
- [ ] `.changeset/transport-url-query-params.md` exists with `'logixlysia': patch`
- [ ] `git status` shows no file outside the in-scope list

## STOP conditions

- The excerpt of `src/output/index.ts:61-69` does not match the live file.
- An existing test in `__tests__/output/` or `__tests__/adapters/` asserts a transport URL containing `?` and you would have to change its expectation (report which; the reviewer decides).
- Lint demands a restructure beyond the helper above.

## Maintenance notes

- If a future change makes `precomputed.pathname`/`search` always available (for example by setting `needsUrlParts` when transports exist), `withoutQuery` can go and the record can use `origin + pathname (+ search)`. Until then the string helper is the cheapest correct option.
- Reviewer: check that `method` and the rest of `meta` are unchanged, and that the test for `logQueryParams: true` keeps the full query including the second parameter.
- Deferred on purpose: widening `isSensitiveKey` for `code`, `state`, `sig`, `otp` (false positives on error payloads where `code` is a status code).
