# Plan 028: Close the redaction gaps and sanitize every console-bound string

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 478f40d..HEAD -- packages/logixlysia/src/utils/redact.ts packages/logixlysia/src/utils/sanitize.ts packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/src/adapters/shared.ts packages/logixlysia/src/sentry.ts packages/logixlysia/src/enrichers.ts packages/logixlysia/__tests__/utils packages/logixlysia/__tests__/enrichers`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Plan 026 edits `adapters/shared.ts`
> (the batch queue); this plan touches only the error-message line in
> `attemptPost` — rebase around it.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `478f40d`, 2026-09-19

## Why this matters

`autoRedact` (on by default in the `prod` preset) is the feature users rely on so that logs shipped to Axiom, Datadog, Sentry, Loki, and friends do not carry secrets. Six gaps were verified at runtime:

1. **Query-string credentials reach every transport.** Transports receive the full `request.url`. `redactRequestUrl` runs only pattern redaction on the query string, so `?token=…&password=…&api_key=…` ship verbatim while the same key names inside objects and headers are masked. Console and file print only the pathname by default, so operators assume query params are not logged.
2. **`error.cause` is erased, not redacted.** The error cloner copies own properties with `Object.keys`, which skips the non-enumerable `cause`; the whole cause chain disappears from every sink in production.
3. **IPv4 masking eats version strings.** `\b(?:\d{1,3}\.){3}\d{1,3}\b` turns `Chrome/120.0.0.0` into `Chrome/[REDACTED]`, blanking the very field the user-agent enricher produces, while IPv6 is not masked at all.
4. **Console output is unsanitized.** The file sink escapes control characters; the console path prints `data.message`, the raw-URL fallback, and the context tree's `error` entry verbatim. An error message built from request data can inject newlines and ANSI escapes into the terminal and stdout-ingesting shippers. Adapter HTTP errors also embed a 200-char slice of a third-party response body unsanitized.
5. **The Sentry DSN is echoed in the thrown config error** when it fails to parse.
6. **Geo enricher headers are unbounded.** City/region/timezone strings from spoofable edge headers are merged into context with no length cap; latitude/longitude accept any finite number.

## Current state

Files and roles:

- `packages/logixlysia/src/utils/redact.ts` — pattern regexes (lines 1–8), `DEFAULT_REDACT_KEYS` (16–40), `normalizeKeyName`/`isSensitiveKey` (42–60), `redactRequestUrl` (88–105), error clone (≈168–190), `redactRecordEntries` (≈216–243), `redactRequest` (315–349).
- `packages/logixlysia/src/utils/sanitize.ts` — `sanitizeLogText(value, maxLength = 2048)`: escapes `\r\n\t` as visible sequences, strips C0/C1/DEL, bounds length.
- `packages/logixlysia/src/logger/create-logger.ts` — console formatter. `getMessageToken` (465–473) returns `data.message` verbatim; the context tree's `error` entry is pushed raw in `collectStructuredErrorEntries` (≈370–375) while `error.internal` goes through `stringifyTreeValue` (which sanitizes); the URL-parse fallback (≈494–499) returns `request.url` raw.
- `packages/logixlysia/src/adapters/shared.ts` — `attemptPost` (98–145): `detail = (await response.text()…).slice(0, 200)` is interpolated into the `Error` message.
- `packages/logixlysia/src/sentry.ts` — `parseDsn` (95–112) throws `` `invalid DSN. Expected https://<public-key>@<host>/<project-id>, got '${dsn}'` ``.
- `packages/logixlysia/src/enrichers.ts` — `geoEnricher` (≈182–306): `GEO_HEADERS`, `GEO_NUMERIC_HEADERS`, `decodeHeaderValue`, `readNetlifyGeo` (atob + JSON.parse of a client header). The traceparent enricher in the same file caps `tracestate` at 512 chars (a precedent for bounding).
- Tests: `__tests__/utils/redact.test.ts` (31 tests; no `cause`, no query-key, no version-string case), `__tests__/utils/sanitize.test.ts`, `__tests__/enrichers/built-ins.test.ts`, `__tests__/adapters/sentry.test.ts`.

Regexes today (`redact.ts:1–8`):

```ts
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}/g
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const CREDIT_CARD_CANDIDATE_REGEX = /\b(?:\d[ -]*?){13,19}\b/g
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g
```

`redactRequestUrl` today (`redact.ts:88–105`):

```ts
const redactRequestUrl = (urlString: string): string => {
  try {
    const u = new URL(urlString)
    if (u.username !== '') { u.username = redactUrlAuthoritySegment(u.username) }
    if (u.password !== '') { u.password = redactUrlAuthoritySegment(u.password) }
    u.hostname = redactUrlAuthoritySegment(u.hostname)
    u.pathname = redactString(u.pathname)
    u.search = redactString(u.search)
    u.hash = redactString(u.hash)
    return u.toString()
  } catch {
    return redactString(urlString).replaceAll(REDACTED_TEXT, URL_SAFE_REDACT)
  }
}
```

`redactRequest(request, extraKeys)` (`redact.ts:315–349`) calls `redactRequestUrl(request.url)` — note it does not pass `extraKeys`, so the URL step cannot consult user `redactKeys` today.

Error clone today (`redact.ts:≈168–190`):

```ts
  const proto = Object.getPrototypeOf(originalError) as object
  const newError = Object.create(proto) as Error & Record<string, unknown>
  newError.message = redactedMessage
  newError.name = originalError.name
  if (originalError.stack !== undefined) { newError.stack = redactString(originalError.stack) }
  const errorRecord = originalError as unknown as Record<string, unknown>
  for (const key of Object.keys(errorRecord)) {
    if (key !== 'message' && key !== 'name' && key !== 'stack') {
      newError[key] = isSensitiveKey(key, extraKeys)
        ? REDACTED_TEXT
        : redactInner(errorRecord[key], inProgress, extraKeys)
    }
  }
  return newError
```

(`src/desertant.ts:192` does the same walk correctly with `Object.getOwnPropertyNames` — use it as the reference.)

`getMessageToken` today (`create-logger.ts:465–473`):

```ts
const getMessageToken = (tokens: Set<string>, data: Record<string, unknown>): string => {
  if (!tokens.has('{message}')) { return '' }
  return typeof data.message === 'string' ? data.message : ''
}
```

`sanitizeLogText` is already imported and used in `create-logger.ts` for the IP token (line ≈65) and tree values (≈296–317); the file sink uses it for pathname and message (`output/file.ts:75`).

Conventions: Biome via `ultracite`; regex literals at module top level (never inside loops); constants `UPPER_SNAKE`; tests in `bun:test`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint / Format | `bun run lint` / `bun run format` | exit 0 |
| Redaction tests | `cd packages/logixlysia && bun test __tests__/utils` | all pass |
| Enricher tests | `cd packages/logixlysia && bun test __tests__/enrichers` | all pass |
| Formatter tests | `cd packages/logixlysia && bun test __tests__/logger` | all pass |
| Full | `cd packages/logixlysia && bun test` | all pass |
| Bench | `bun run bench` | redact-heavy suites within noise |

## Scope

**In scope**:

- `packages/logixlysia/src/utils/redact.ts`
- `packages/logixlysia/src/logger/create-logger.ts` (three call sites only)
- `packages/logixlysia/src/adapters/shared.ts` (the `detail` line in `attemptPost` only)
- `packages/logixlysia/src/sentry.ts` (`parseDsn` error message only)
- `packages/logixlysia/src/enrichers.ts` (`geoEnricher` / `readNetlifyGeo` only)
- `packages/logixlysia/src/types/config.ts` (add `@default false` to `autoRedact` doc comment)
- `packages/logixlysia/__tests__/utils/redact.test.ts`, `__tests__/logger/format-output.test.ts` (or a new `__tests__/logger/sanitized-output.test.ts`), `__tests__/enrichers/built-ins.test.ts`, `__tests__/adapters/sentry.test.ts`
- `apps/docs/content/configuration.mdx` (one sentence under `autoRedact`/`redactKeys` about query parameters)
- `.changeset/<slug>.md`
- `plans/README.md`

**Out of scope**:

- `src/desertant.ts` — correct already.
- `src/output/file.ts` — already sanitized.
- Changing `DEFAULT_REDACT_KEYS` membership.
- The batch-queue logic in `shared.ts` (plan 026).

## Git workflow

- Branch: `improve/028-redaction-and-sanitization` off `main`.
- Conventional commits per step: `fix(redact): mask sensitive query parameters by key name`, `fix(redact): preserve error.cause and other non-enumerable fields`, `fix(redact): stop matching version strings as IPv4; add IPv6`, `fix(logger): sanitize message, url fallback and error entries on the console path`, `fix(sentry): keep the DSN out of the config error`, `fix(enrichers): bound geo header values`.
- No `Co-Authored-By: Claude` trailer.
- Changeset `.changeset/redaction-hardening.md`:

  ```markdown
  ---
  'logixlysia': patch
  ---

  `autoRedact` now masks query-string values whose parameter name is sensitive (`token`, `password`, `api_key`, and any `redactKeys` entry), preserves `error.cause` and other non-enumerable error fields instead of dropping them, no longer mistakes dotted version numbers like `120.0.0.0` for IP addresses, and masks IPv6 addresses. Console output sanitizes the message, the raw-URL fallback, and error entries the same way the file sink already does. The Sentry adapter no longer echoes the DSN in its configuration error. The geo enricher bounds header-derived values.
  ```

- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Sensitive query parameters

In `redact.ts`:

1. Change `redactRequestUrl(urlString)` to `redactRequestUrl(urlString, extraKeys?: readonly string[])` and, before `u.search = redactString(u.search)`, iterate `u.searchParams`:

   ```ts
       const keys = [...u.searchParams.keys()]
       for (const key of keys) {
         if (isSensitiveKey(key, extraKeys)) {
           u.searchParams.set(key, REDACTED_TEXT)
         }
       }
   ```

   Use a copy of the keys (mutating while iterating is undefined). `URLSearchParams.set` collapses duplicates to one value, which is acceptable.

2. Pass `extraKeys` from `redactRequest`.

Note: `REDACTED_TEXT` becomes `%5BREDACTED%5D` in `u.toString()`; that is fine (the existing `URL_SAFE_REDACT` constant exists for the parse-failure path — check whether it is the intended URL-safe form and use it in `set()` if so).

**Verify**: tests in `redact.test.ts`: `redactRequest(new Request('http://h/p?token=abc&email=a@b.co&keep=1'))`'s `url` contains no `abc`, contains a redacted email, and still contains `keep=1`; camelCase `?apiKey=x` masked; a custom `redactKeys: ['promo']` masks `?promo=SECRET`.

### Step 2: Preserve non-enumerable error fields

Replace `Object.keys(errorRecord)` with `Object.getOwnPropertyNames(errorRecord)` in the error clone, keeping the `message`/`name`/`stack` exclusions. Preserve enumerability: use `Object.getOwnPropertyDescriptor` and `Object.defineProperty(newError, key, { ...descriptor, value: redacted })` so `cause` stays non-enumerable (matching the original) and JSON output shape does not change.

**Verify**: tests: `redact({ error: new Error('outer', { cause: new Error('a@b.co') }) })` → `.error.cause` is defined and its message is `[REDACTED]`; nested cause chain of depth 3; self-referential cause (`e.cause = e`) does not loop (the existing `inProgress` WeakSet guard — assert `[Circular]` or the original reference, whichever the current guard produces for other cycles; check `redact.test.ts`'s existing circular test for the expected value).

### Step 3: IPv4 precision and IPv6

Replace `IPV4_REGEX` with an octet-validated pattern that is not preceded by `/`, a letter, or a digit-dot (version-string shapes):

```ts
const IPV4_OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`
const IPV4_REGEX = new RegExp(String.raw`(?<![\w/.])(?:${IPV4_OCTET}\.){3}${IPV4_OCTET}(?![\w.])`, 'g')
```

Add a bounded IPv6 pattern (full and `::`-compressed forms, hex groups of 1–4, at most 8 groups; a lookbehind-free approximation is acceptable if it does not match plain hex words):

```ts
const IPV6_REGEX = /(?<![\w:])(?:[0-9a-f]{1,4}:){2,7}(?::?[0-9a-f]{1,4}){1,6}(?![\w:])/gi
```

Wire `IPV6_REGEX` into `redactString` after IPv4. Keep both at module top level. Biome's `useTopLevelRegex` is satisfied by top-level `new RegExp` too, but if it complains, write the IPv4 pattern as a literal.

**Verify**: tests: `'Chrome/120.0.0.0 Safari/537.36'` unchanged; `'IP is 192.168.1.1'` → masked (existing test stays green); `'999.999.999.999'` unchanged; `'0.0.0.0'` masked; `'2001:db8::1'` masked; `'deadbeef'` unchanged; a `v1.2.3.4` build tag unchanged. Run the existing ReDoS timing test to confirm it still passes under 500 ms.

### Step 4: Sanitize the console path

In `create-logger.ts`:

1. `getMessageToken` → `return typeof data.message === 'string' ? sanitizeLogText(data.message) : ''`.
2. In `collectStructuredErrorEntries`, wrap the `error` message pushed as `['error', msg]` in `sanitizeLogText(...)`.
3. In the URL-parse fallback (`resolvePathTokens` or whichever helper returns `request.url` when `new URL` throws), return `sanitizeLogText(request.url, 1024)` (same cap the file sink uses for the pathname).
4. Check `{requestId}` (≈593–605): it is `String(ctx.requestId)`; the request-id middleware validates its own IDs but an enricher may set anything — wrap in `sanitizeLogText(..., 128)`.

In `adapters/shared.ts` `attemptPost`: `const detail = sanitizeLogText((await response.text().catch(() => '')).slice(0, ERROR_BODY_PREVIEW_LENGTH))` — import `sanitizeLogText` from `../utils/sanitize`.

**Verify**: new test file `__tests__/logger/sanitized-output.test.ts` (model after `__tests__/logger/format-output.test.ts`): a request whose handler throws `new Error('boom\nERROR forged 200 0ms\u001b[31m')` with the internal logger enabled and `spyConsole(['error'])` → the single `console.error` argument contains `\\n` (two characters) and does not contain the raw `\u001b`; a custom `log.info('a\u001b[2Jb')` likewise. Adapter: `stubFetch([{ status: 500, body: 'x\u001b[31my' }])` with `retries: 0` → rejection message contains no `\u001b`.

### Step 5: Sentry DSN out of the error

In `sentry.ts` `parseDsn`, replace the message with one that names the missing component and echoes at most `url?.protocol` and `url?.host`:

```ts
    throw transportError(
      'Sentry',
      `invalid DSN (expected https://<public-key>@<host>/<project-id>; ${describeDsnProblem(url, projectId)})`
    )
```

where `describeDsnProblem` returns `'could not be parsed as a URL'`, `'missing public key'`, or `'missing project id'`.

**Verify**: `__tests__/adapters/sentry.test.ts`: constructing with a DSN like `https://secretkey@sentry.example.com` (no project id) throws; the message does not contain `secretkey`.

### Step 6: Bound the geo enricher

In `enrichers.ts`:

- `const GEO_STRING_MAX = 128`, `const GEO_RAW_HEADER_MAX = 2048`.
- After `decodeHeaderValue`, `slice(0, GEO_STRING_MAX)`.
- `country`/`region`: keep only if they match `/^[A-Za-z0-9-]{1,10}$/` (ISO codes and Cloudflare region codes fit); otherwise drop the field.
- Clamp latitude to `[-90, 90]` and longitude to `[-180, 180]`; drop out-of-range values.
- In `readNetlifyGeo`, return early if `raw.length > GEO_RAW_HEADER_MAX`; apply the same string cap and code pattern to the parsed fields.
- Add one sentence to the `geoEnricher` doc comment: values come from client-settable headers; trust them only behind an edge that overwrites them.

**Verify**: `__tests__/enrichers/built-ins.test.ts`: a 5 000-char `x-vercel-ip-city` is truncated to 128; `cf-ipcountry: '<script>'` is dropped; `x-vercel-ip-latitude: '1e308'` is dropped; a normal Vercel header set still yields all six fields (existing tests stay green).

### Step 7: Docs note, changeset, format, full gate

`apps/docs/content/configuration.mdx` under `redactKeys`: one sentence that key-name redaction also applies to query-string parameter names and that transports receive the full URL. Add `@default false` to `autoRedact`'s doc comment in `types/config.ts`. Create the changeset; `bun run format`.

**Verify**: `bun run lint && bun run typecheck && cd packages/logixlysia && bun test` → all exit 0. `bun run bench` → no regression beyond noise on suites with `autoRedact` (the identity fast path is unchanged; the query loop runs only when a URL has a query string).

## Test plan

- `redact.test.ts`: +3 query-param tests, +3 cause tests, +7 IPv4/IPv6 tests.
- `sanitized-output.test.ts` (new): +2 console tests; `shared.test.ts` or `sentry.test.ts`: +1 body-preview test, +1 DSN test.
- `built-ins.test.ts`: +3 geo bound tests.
- Pattern: existing `describe('redactString')` / `describe('redact')` blocks; `spyConsole` from `_helpers/console.ts`; `stubFetch` from `__tests__/adapters/helpers.ts`.

## Done criteria

- [ ] `grep -n "getOwnPropertyNames" packages/logixlysia/src/utils/redact.ts` → present in the error clone
- [ ] `grep -n "searchParams" packages/logixlysia/src/utils/redact.ts` → present
- [ ] `grep -n "IPV6_REGEX" packages/logixlysia/src/utils/redact.ts` → defined and used
- [ ] `grep -n "sanitizeLogText" packages/logixlysia/src/logger/create-logger.ts | wc -l` increased by ≥ 3 versus HEAD
- [ ] `grep -n "got '\${dsn}'" packages/logixlysia/src/sentry.ts` → no match
- [ ] `cd packages/logixlysia && bun test` exits 0 with ≥ 19 new tests; `bun run lint`, `bun run typecheck` exit 0
- [ ] `.changeset/redaction-hardening.md` exists; `plans/README.md` updated

## STOP conditions

- The cited code no longer matches the excerpts.
- Biome rejects the lookbehind regex (`useTopLevelRegex` or a parser limitation) and no literal form satisfies it — report the diagnostic.
- The existing ReDoS timing test (`'redacts email in long percent run without hanging'`) exceeds 500 ms after the IPv6 addition — revert the IPv6 pattern and report.
- An existing test asserts that `120.0.0.0`-style strings ARE redacted (would indicate an intentional decision) — report before changing.

## Maintenance notes

- `isSensitiveKey` is now applied to query parameter names; adding a key to `DEFAULT_REDACT_KEYS` widens URL masking too.
- The desertant wrapper walks `meta.request.url` as well, so users with a model get both passes; that is intended.
- Reviewer focus: enumerability preserved on the cloned error (a `cause` that becomes enumerable would start appearing in JSON responses from `HttpError.toJSON()` — verify `HttpError`'s `internal` stays non-enumerable after redaction).
- Deferred: an allow-list for query params users *want* logged (e.g. `page`), and rendering redacted values as the key-preserving `token=[REDACTED]` in the console pathname when `logQueryParams` is on (it already does, since `pathname+search` is derived from the redacted request).
