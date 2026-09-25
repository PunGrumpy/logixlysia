# Plan 031: Stop following redirects on credentialed ingest POSTs and validate adapter endpoints at construction

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5522d31..HEAD -- packages/logixlysia/src/adapters packages/logixlysia/src/axiom.ts packages/logixlysia/src/better-stack.ts packages/logixlysia/src/clickhouse.ts packages/logixlysia/src/datadog.ts packages/logixlysia/src/hyperdx.ts packages/logixlysia/src/loki.ts packages/logixlysia/src/otlp.ts packages/logixlysia/src/posthog.ts packages/logixlysia/src/sentry.ts packages/logixlysia/__tests__/adapters` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `5522d31`, 2026-09-19

## Why this matters

Every built-in adapter POSTs with a long-lived vendor credential in a header (`DD-API-KEY`, `X-ClickHouse-Key`, `Authorization: Bearer …`, Basic auth). `fetch` follows redirects by default, and the Fetch spec only strips `Authorization` on a cross-origin redirect: the vendor-specific headers travel to wherever a 3xx points. One mistyped or tampered endpoint env var, or one compromised ingest host, is enough to exfiltrate the credential.

Separately, endpoint values from env vars are interpolated into URLs with no parsing (`stripTrailingSlashes` is the only normalisation). A non-URL value fails late, at the first flush, as a repeating runtime transport error, whereas every other misconfiguration in these adapters throws at `createXTransport()`.

## Current state

- `packages/logixlysia/src/adapters/shared.ts` — `attemptPost` (`fetch(input.url, { body, headers, method: 'POST', signal })`, around line 162), `createHttpTransport(input: { body, headers, name, options, url })`, `stripTrailingSlashes`, `transportError(adapter, detail)`.
- `packages/logixlysia/src/adapters/otlp-core.ts` — builds `url` for `hyperdx.ts` and `otlp.ts`, calls `createHttpTransport` at line 83.
- URL construction sites (all read at `5522d31`):
  - `axiom.ts:60–61, 87` — `stripTrailingSlashes(options.baseUrl ?? envString('AXIOM_URL') ?? DEFAULT_BASE_URL)` then `` `${baseUrl}/v1/datasets/${encodeURIComponent(dataset)}/ingest` ``
  - `better-stack.ts:64` — `stripTrailingSlashes(...)`
  - `clickhouse.ts:85–86, 119` — `` `${baseUrl}/?${query}` ``
  - `datadog.ts:61, 100` — `site` from `DD_SITE`, `` `https://http-intake.logs.${site}/api/v2/logs` ``
  - `hyperdx.ts:54, 68` — `` `${endpoint}/v1/logs` ``
  - `loki.ts:59, 118` — `` `${stripTrailingSlashes(rawUrl)}/loki/api/v1/push` ``
  - `otlp.ts:73, 81, 115` — `resolveLogsUrl(options.endpoint)`
  - `posthog.ts:70, 107` — `` `${host}/batch/` ``
  - `sentry.ts` — `parseDsn` already uses `new URL` and throws on failure (leave as is).
- `__tests__/adapters/helpers.ts` — `stubFetch` records `{ body, headers, method, url }` per call (not `redirect`).
- `__tests__/adapters/shared.test.ts` — `postWithRetry` tests using `stubFetch`.

Conventions: Biome via `ultracite`; constants `UPPER_SNAKE`; errors via `transportError(name, detail)` with the message shape `[logixlysia] <Name> transport: <detail>`; per-adapter tests in `__tests__/adapters/<name>.test.ts` use `stubEnv` and construct the transport.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Typecheck / Lint / Format | `bun run typecheck` / `bun run lint` / `bun run format` | exit 0 |
| Adapter tests | `cd packages/logixlysia && bun test __tests__/adapters` | all pass |
| Full | `cd packages/logixlysia && bun test` | all pass |

## Scope

**In scope**: `src/adapters/shared.ts`, `src/adapters/otlp-core.ts`, the nine adapter files listed above (URL construction line only), `__tests__/adapters/helpers.ts`, `__tests__/adapters/shared.test.ts`, each `__tests__/adapters/<name>.test.ts` (one new test each), `apps/docs/content/adapters/overview.mdx` (one sentence), `.changeset/adapter-endpoints.md`.

**Out of scope**: batching/retry logic; `sentry.ts`'s DSN parsing; `desertant.ts`.

## Git workflow

- Branch: `improve/031-adapter-endpoints` off `main`.
- Commits: `fix(adapters): never follow redirects on ingest requests`, `fix(adapters): validate endpoint URLs when a transport is created`.
- Changeset `.changeset/adapter-endpoints.md`:

  ```markdown
  ---
  'logixlysia': patch
  ---

  Built-in adapters no longer follow HTTP redirects on ingest requests, so a credential header cannot be forwarded to another origin; a redirect now fails the batch and is reported like any other transport error. Endpoint URLs from options or env vars are validated when the transport is created and must use `http:` or `https:`.
  ```

- Do NOT push or open a PR.

## Steps

### Step 1: `redirect: 'error'`

In `attemptPost`, add `redirect: 'error'` to the `fetch` init. A rejected fetch (which is what `redirect: 'error'` produces on a 3xx) already goes through the existing catch → `retryOrRethrow` path; that is acceptable (a redirect is treated like a network failure and retried up to `retries` times, then reported).

**Verify**: extend `stubFetch` to record `init?.redirect` as `redirect` on each `FetchCall`; test `'sends ingest requests with redirect: error'` asserts `stub.calls[0].redirect === 'error'`.

### Step 2: `resolveEndpoint` helper

In `shared.ts` add and export:

```ts
/** Parses a fully built endpoint once, at construction, so a bad env var fails here rather than on the first flush. */
export const resolveEndpoint = (name: string, url: string): string => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw transportError(name, `invalid endpoint URL '${url}'`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw transportError(
      name,
      `endpoint must use http or https, got '${parsed.protocol}'`
    )
  }
  return parsed.toString()
}
```

Note: `URL.toString()` normalises (adds a trailing `/` to a bare origin). Because every adapter appends a path before calling this, the result is byte-identical for well-formed inputs; assert that in a test.

Call it in `createHttpTransport` on `input.url` (one place covers all nine adapters and `otlp-core.ts`), passing `input.name`. Do not change the individual adapter files unless the typecheck requires it.

Sentry's DSN is not an endpoint URL; `parseDsn` already validates it, and its `envelopeUrl` goes through `createHttpTransport` too, so it is covered without edits.

**Verify**: `shared.test.ts`: `resolveEndpoint('Test', 'https://a.example/v1/x')` returns the same string; `'not a url'` throws with a message containing `invalid endpoint URL`; `'ftp://a.example/x'` throws mentioning `http or https`. Per adapter test file: construct with an invalid URL (`url: 'nope'` or `baseUrl`/`endpoint`/`host`/`site` as applicable) and assert it throws at construction with the adapter's name in the message. For Datadog, `site: 'bad site'` → the assembled URL has a space → throws.

### Step 3: Docs, changeset, format, gate

`adapters/overview.mdx`: one sentence in the shared-options section that endpoints are validated at construction and redirects are never followed. Changeset. `bun run format && bun run lint && bun run typecheck && cd packages/logixlysia && bun test`.

## Done criteria

- [ ] `grep -n "redirect: 'error'" packages/logixlysia/src/adapters/shared.ts` → match
- [ ] `grep -n "resolveEndpoint" packages/logixlysia/src/adapters/shared.ts` → definition and one call in `createHttpTransport`
- [ ] `cd packages/logixlysia && bun test` exits 0 with ≥ 11 new tests (2 in shared + 1 per adapter incl. otlp/hyperdx)
- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `.changeset/adapter-endpoints.md` exists

## STOP conditions

- `attemptPost` no longer calls `fetch(input.url, {...})` in the shape excerpted.
- An existing adapter test constructs a transport with a deliberately non-URL endpoint and expects success (report which).
- Bun's `fetch` rejects `redirect: 'error'` as unsupported (check with a scratch script; report).

## Maintenance notes

- If an operator genuinely needs a redirecting proxy, the failure is loud and immediate; document the workaround (point at the final URL) if it ever comes up.
