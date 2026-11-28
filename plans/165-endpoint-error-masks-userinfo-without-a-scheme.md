# Plan 165: An invalid adapter endpoint with credentials and no scheme is reported without them

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not edit `plans/README.md`; the reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6a516de2..HEAD -- packages/logixlysia/src/adapters/shared.ts packages/logixlysia/__tests__/adapters/shared.test.ts`
> If either file changed, compare the "Current state" excerpts against the
> live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `6a516de2`, 2026-11-28

## Why this matters

Every adapter validates its endpoint at creation and throws `invalid endpoint URL '…'` for a string `URL` cannot parse. That message reaches the console and any error monitor. The message masks `user:password@` only when the string starts with a scheme and `://`. An endpoint that lost its scheme, such as a scheme-relative `//user:password@logs.example.com/v1` read from an environment variable, is echoed whole, password included. Measured at `6a516de2`: `resolveEndpoint('x', '//user:hunter2@logs.example.com/v1')` throws `[logixlysia] x transport: invalid endpoint URL '//user:hunter2@logs.example.com/v1'`.

## Current state

`packages/logixlysia/src/adapters/shared.ts`, lines 180–211:

```ts
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu
const URL_USERINFO = /^(?<scheme>[a-z][a-z0-9+.-]*:\/\/).*@/iu
const URL_QUERY_OR_FRAGMENT_MARK = /[?#]/u

const withoutUserinfo = (url: string): string =>
  url.replace(URL_USERINFO, '$<scheme><redacted>@')

// Some intake APIs take their key in the query string, so everything after
// the first `?` or `#` is hidden. A raw `?` or `#` inside a password looks the
// same as that mark, so when an `@` follows it the end of the userinfo is
// unknown and only the scheme is kept.
const withoutCredentials = (url: string): string => {
  const markIndex = url.search(URL_QUERY_OR_FRAGMENT_MARK)
  if (markIndex === -1) {
    return withoutUserinfo(url)
  }
  if (url.includes('@', markIndex + 1)) {
    return `${URL_SCHEME.exec(url)?.[0] ?? ''}<redacted>`
  }
  return `${withoutUserinfo(url.slice(0, markIndex))}${url.charAt(markIndex)}<redacted>`
}
```

`resolveEndpoint(name, url)` (exported, same file) throws `transportError(name, \`invalid endpoint URL '${withoutCredentials(url)}'\`)` when `URL.canParse(url)` is false.

Tests: `packages/logixlysia/__tests__/adapters/shared.test.ts`, around lines 225–300, has two table tests: one whose cases are `{ input, secret }` and assert `<redacted>@` is present and the secret absent, and `'does not echo the query or fragment of an unparsable URL'` whose cases are `{ input, kept, secrets }` and assert the exact message `[logixlysia] x transport: invalid endpoint URL '${kept}'`. Existing rows that must keep passing include:

- `'http://user:p@ss@bad host/x'` → contains `<redacted>@`, not `p@ss`
- `'ingest.example.com/v1?api_key=SECRETVALUE'` → kept `'ingest.example.com/v1?<redacted>'`
- `'http://user:pw@exa mple.com/p?k=SECRETVALUE'` → kept `'http://<redacted>@exa mple.com/p?<redacted>'`

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (repo root) | exit 0 |
| Build | `cd packages/logixlysia && bun run build` | exit 0 |
| One test file | `cd packages/logixlysia && bun test __tests__/adapters/shared.test.ts` | all pass |
| Full suite | `cd packages/logixlysia && bun test` | 0 fail (1556 pass before) |
| Lint / format / typecheck | `bun run lint`, `bun run format`, `bun run typecheck` (repo root) | exit 0 |

`turbo` may append a block to the root `AGENTS.md` when it runs. Never commit that: run `git checkout -- AGENTS.md` before each commit.

## Scope

**In scope**:
- `packages/logixlysia/src/adapters/shared.ts` (`URL_USERINFO` / `withoutUserinfo` only)
- `packages/logixlysia/__tests__/adapters/shared.test.ts`
- `.changeset/endpoint-error-masks-userinfo-without-a-scheme.md` (create)

**Out of scope**: the query/fragment branch of `withoutCredentials`, every adapter file, the response-body preview in transport errors, docs.

## Git workflow

- Work on the branch you were started on (`fix/endpoint-error-userinfo-without-scheme`). Do not push, do not open a pull request.
- Two commits: `fix(adapters): hide credentials in an invalid endpoint that has no scheme` (source + tests), then `chore(changeset): add endpoint-error-masks-userinfo-without-a-scheme`.
- Commit with `git -c commit.gpgsign=false commit`, subject plus a short body that says why. No `Co-Authored-By`, no "Generated with", no mention of any AI tool or model.

## Steps

### Step 1: Failing test rows

Add to the exact-message table (`{ input, kept, secrets }`):

```ts
{
  input: '//user:hunter2@logs.example.com/v1',
  kept: '<redacted>@logs.example.com/v1',
  secrets: ['hunter2', 'user']
},
{
  input: 'user:hunter2@bad host/v1',
  kept: '<redacted>@bad host/v1',
  secrets: ['hunter2']
},
{
  input: '//user:hunter2@bad host/v1?k=SECRETVALUE',
  kept: '<redacted>@bad host/v1?<redacted>',
  secrets: ['hunter2', 'SECRETVALUE']
}
```

**Verify**: `bun test __tests__/adapters/shared.test.ts` → the new rows fail, showing the secret in the message. (If `'user:hunter2@bad host/v1'` is rejected with a different message such as `endpoint must use http or https`, because `URL` parses it, replace that row's input with one `URL.canParse` rejects and say so in your report.)

### Step 2: Mask userinfo with or without a scheme

Make the scheme optional in the userinfo rule so that everything up to the last `@` is replaced, keeping the scheme when there is one:

```ts
const URL_USERINFO = /^(?<scheme>[a-z][a-z0-9+.-]*:\/\/)?.*@/iu

const withoutUserinfo = (url: string): string =>
  url.replace(URL_USERINFO, (_match, scheme?: string) => `${scheme ?? ''}<redacted>@`)
```

(`'$<scheme>'` in a replacement string yields an empty string for an unmatched group in JavaScript, so keeping the string form `'$<scheme><redacted>@'` is also correct; use whichever passes lint.) The leading `//` of a scheme-relative value is part of what is replaced.

**Verify**: `bun test __tests__/adapters/shared.test.ts` → all pass, old rows included.

### Step 3: Full verification and changeset

Run build, full suite, lint, typecheck. Then create `.changeset/endpoint-error-masks-userinfo-without-a-scheme.md`:

```md
---
'logixlysia': patch
---

An adapter endpoint that cannot be parsed and carries `user:password@` without a scheme, such as `//user:password@host/path`, is reported as `<redacted>@host/path`. Before, the credentials were masked only when the value started with a scheme, so the error printed them.
```

## Test plan

Three new rows in the existing table test; no new test function. All existing rows unchanged.

## Done criteria

- [ ] `cd packages/logixlysia && bun test` → 0 fail
- [ ] `bun run lint` and `bun run typecheck` exit 0
- [ ] `git diff --stat origin/main..HEAD` lists only the three in-scope files
- [ ] `git log origin/main..HEAD --format=%B | grep -ciE 'co-authored|generated with|claude|devin|codex|gpt'` prints `0`
- [ ] `git status --short` is empty

## STOP conditions

- The excerpt above does not match the file.
- An existing row of either table fails after Step 2.

## Maintenance notes

- The rule is greedy to the last `@` on purpose: a password may contain `@`.
- A host part such as `a@b` in a path without userinfo is now also masked up to the `@`. That loses nothing a reader of a startup error needs.
