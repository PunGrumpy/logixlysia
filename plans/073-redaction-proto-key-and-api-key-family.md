# Plan 073: Redaction keeps an own `__proto__` key as a key, `mergeContext` does too, and vendor-prefixed API keys are sensitive

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. Do not update `plans/README.md`; your reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 5115bea..HEAD -- packages/logixlysia/src/utils/redact.ts packages/logixlysia/src/context/request-context.ts packages/logixlysia/__tests__/utils/redact.test.ts packages/logixlysia/__tests__/context/request-context.test.ts`
> must print nothing. If the excerpts under "Current state" do not match the
> live file, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (the `__proto__` fixes), LOW to MED (wider key matching can mask a benign key)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `5115bea`, 2026-10-30

## Why this matters

Two gaps in `autoRedact`, which the `prod` preset turns on and which the docs present as the switch that keeps credentials out of logs.

First, `redact()` rebuilds a redacted object with `result[key] = ...` on a plain `{}`. When the object came from `JSON.parse` of a request body and has an own `__proto__` key, that assignment re-parents the copy instead of writing a key: the `__proto__` entry vanishes from the log, and attacker-chosen properties become inherited on the redacted object, visible to `in` checks downstream (for example the request-id lookup in `create-logger.ts`). `mergeContext` has the same hole through `Object.assign(bag, partial)`, so `log.mergeContext(body)` re-parents the request's context bag. `Object.prototype` is not polluted in either case, but the logged data is wrong and forgeable. `snapshotMeta` in `adapters/shared.ts` already uses `Object.fromEntries` for this reason.

Second, `isSensitiveKey` matches the API-key family only when the whole normalized name is `api-key`, `x-api-key` or `apikey`. `x-goog-api-key`, `stripeApiKey`, `openai_api_key`, `accessKey`, `x-authorization` and `jwt` all pass through with their values intact, in headers, in query strings (`redactRequestUrl` uses the same matcher) and in nested objects, while `authorization` next to them is masked.

## Current state

`packages/logixlysia/src/utils/redact.ts`:

- `:40-65` `DEFAULT_REDACT_KEYS` (whole-name matches, hyphenated lowercase: `authorization`, `cookie`, `x-api-key`, `api-key`, `apikey`, `x-auth-token`, `password`, `secret`, `token`, `access-token`, `session`, `session-id`, `private-key`, ...).
- `:67-73` `normalizeKeyName`: camelCase boundary → `-`, `_` → `-`, lowercase. So `stripeApiKey` → `stripe-api-key`, `x_goog_api_key` → `x-goog-api-key`.
- `:75-98`:

  ```ts
  const SENSITIVE_KEY_PARTS: ReadonlySet<string> = new Set([
    'passwd',
    'password',
    'secret'
  ])
  const SENSITIVE_LAST_KEY_PART = 'token'

  export const isSensitiveKey = (
    key: string,
    extraKeys?: readonly string[]
  ): boolean => {
    const normalized = normalizeKeyName(key)
    if (DEFAULT_REDACT_KEYS.includes(normalized)) {
      return true
    }
    if (extraKeys?.some(extraKey => normalizeKeyName(extraKey) === normalized)) {
      return true
    }
    const parts = normalized.split('-')
    return (
      parts.some(part => SENSITIVE_KEY_PARTS.has(part)) ||
      parts.at(-1) === SENSITIVE_LAST_KEY_PART
    )
  }
  ```

- `isSensitiveKey` is called at `:206` (query params), `:276` (headers), `:403`, `:426` (Map keys), `:456` (records).
- `:435-478`, the record branch of the walker (the one to change):

  ```ts
    record: (
      recordValue: Record<string, unknown>,
      inProgress: WeakSet<object>,
      extraKeys?: readonly string[]
    ): Record<string, unknown> | string => {
      let keys: string[]
      try {
        keys = Object.keys(recordValue)
      } catch {
        return UNSERIALIZABLE_TEXT
      }
      let result: Record<string, unknown> | undefined

      for (const [index, key] of keys.entries()) {
        let original: unknown
        let unreadable = false
        try {
          original = recordValue[key]
        } catch {
          unreadable = true
        }
        const sensitive = isSensitiveKey(key, extraKeys)
        let redacted: unknown = REDACTED_TEXT
        if (unreadable) {
          redacted = UNSERIALIZABLE_TEXT
        } else if (!sensitive) {
          redacted = walker.value(original, inProgress, extraKeys)
        }

        if (
          result === undefined &&
          (sensitive || unreadable || redacted !== original)
        ) {
          result = {}
          for (const priorKey of keys.slice(0, index)) {
            result[priorKey] = recordValue[priorKey]
          }
        }
        if (result !== undefined) {
          result[key] = redacted
        }
      }

      return result ?? recordValue
    },
  ```

`packages/logixlysia/src/context/request-context.ts:49-55`:

```ts
    mergeContext(key, partial) {
      if (Object.keys(partial).length === 0) {
        return
      }
      const bag = getOrCreate(key)
      Object.assign(bag, partial)
    },
```

(`getContext` at `:45-48` returns `{ ...bag }`; spread copies own keys, including an own `__proto__`, so no change there.)

Tests: `packages/logixlysia/__tests__/utils/redact.test.ts` imports `isSensitiveKey`, `redact`, `redactRequest`, `redactString`; `describe('isSensitiveKey')` starts at `:438`; nested-object redaction tests around `:233`. `packages/logixlysia/__tests__/context/request-context.test.ts` has "mergeContext accumulates fields per request" at `:8`. There is a `__proto__` test for `snapshotMeta` in `__tests__/adapters/shared.test.ts` (search `__proto__` there for the shape of a `JSON.parse` fixture).

## Commands you will need

Run from the worktree root unless the row says otherwise. A fresh worktree has no `node_modules`; install first.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0, lockfile unchanged (`git status --short bun.lock` prints nothing) |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 (run before every commit) |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests (package) | `cd packages/logixlysia && bun test` | `0 fail`; 723 tests pass at the planned-at commit, plus the ones this plan adds |
| One test file | `cd packages/logixlysia && bun test __tests__/<area>/<file>.test.ts` | `0 fail` |
| Build | `bun run build` | exit 0, `packages/logixlysia/dist/` has 14 entries |

Notes that save time:

- `turbo` (used by `bun run typecheck`, `bun run build`, `bun run test` at the root) appends an "agent rules" block to `AGENTS.md` when it runs. Never commit that block. After any turbo run, `git checkout -- AGENTS.md` unless this plan tells you to edit `AGENTS.md` (then revert only the appended block).
- Lint is Ultracite (oxlint + oxfmt) with strict rules. Never add a disable comment, an ignore entry, or loosen a rule. Restructure the code until it passes. `bun run format` fixes formatting only.
- Tests use `bun:test` (`describe`, `test`, `expect`). Assert what a caller observes (a returned value, a written line, a transport call, a thrown error), not internals. Derive the expected value from the requirement, not from running the code.
- Comments: write none that narrate the code or the step. Keep a comment only for a non-obvious reason the code cannot show.

## Git workflow

- Start from commit `5115bea` (`origin/main`). In your worktree: `git checkout -B improve/<NNN>-<slug> 5115bea`. Do not branch from the worktree's initial HEAD, which is an unrelated docs branch.
- Conventional Commits, one commit per logical unit, in the order the steps are listed: `fix(<area>): <imperative subject>`, body explains why in two to four plain sentences. No `Co-Authored-By` or any attribution trailer. No "Generated with" line.
- Commit with signing off, per command: `git -c commit.gpgsign=false commit -m ...`. The session cannot reach the repository's signer.
- Every change under `packages/logixlysia/` needs a changeset unless this plan says otherwise: `.changeset/<slug>.md` containing

  ```
  ---
  'logixlysia': patch
  ---

  <one or two sentences, user-facing, past tense: what was wrong and what the user sees now>
  ```

  Commit the changeset together with the fix it describes.
- Do not push, do not open a PR, do not touch `plans/`. Your reviewer maintains the index and does the delivery.


## Scope

**In scope** (the only files you may modify):

- `packages/logixlysia/src/utils/redact.ts`
- `packages/logixlysia/src/context/request-context.ts`
- `packages/logixlysia/__tests__/utils/redact.test.ts`
- `packages/logixlysia/__tests__/context/request-context.test.ts`
- `.changeset/redaction-proto-and-api-key-family.md` (create)

**Out of scope**: `src/desertant.ts` (plan 071 fixes its clone), `src/adapters/shared.ts`, `src/utils/error.ts:70` (copies an Error's own props; not request data), `src/index.ts:277-282` (header merge; header names cannot be `__proto__` on the wire), `buildPinoRedactPaths` (keep it on `DEFAULT_REDACT_KEYS`), the free-text `Bearer` heuristic (`looksLikeCredential`), and docs under `apps/docs`.

## Steps

### Step 1: Rebuild redacted records through `Object.fromEntries`

In the record branch, replace `result: Record<string, unknown> | undefined` with `entries: [string, unknown][] | undefined`. When the first change is detected, seed `entries` with the prior keys' `[priorKey, recordValue[priorKey]]` pairs (same reads as today), then push `[key, redacted]` for this and later keys. Return `entries ? Object.fromEntries(entries) : recordValue`. Behaviour for ordinary keys is unchanged: same keys, same order, same values, and an unchanged record is still returned as the same reference.

Tests in `redact.test.ts`:

- `redact(JSON.parse('{"__proto__":{"requestId":"forged"},"email":"a@b.co"}'))` → result has own keys `['__proto__', 'email']` (`Object.keys`), `Object.getPrototypeOf(result) === Object.prototype`, `'requestId' in result` is `false`, and `result.email === '[REDACTED]'`.
- The same for a nested object: `redact({ context: JSON.parse(...) }).context` passes the same checks.

**Verify**: `cd packages/logixlysia && bun test __tests__/utils/redact.test.ts` → `0 fail`.

Commit: `fix(redact): keep an own __proto__ key as a key in redacted copies`.

### Step 2: `mergeContext` defines own properties

Replace `Object.assign(bag, partial)` with a loop over `Object.entries(partial)` that calls `Object.defineProperty(bag, key, { configurable: true, enumerable: true, value, writable: true })`. Keep the empty-partial early return.

Test in `request-context.test.ts`: `store.mergeContext(request, JSON.parse('{"__proto__":{"isAdmin":true},"plan":"pro"}'))`, then `const ctx = store.getContext(request)`: `ctx.plan === 'pro'`, `'isAdmin' in ctx` is `false`, `Object.hasOwn(ctx, '__proto__')` is `true`, and `({}).isAdmin` is `undefined` (no global pollution).

**Verify**: `cd packages/logixlysia && bun test __tests__/context` → `0 fail`.

Commit: `fix(context): keep an own __proto__ key as a key in mergeContext`.

### Step 3: Treat the API-key family and `authorization`/`jwt` parts as sensitive

In `isSensitiveKey`, after the existing part checks, also return `true` when:

- the last part is `key` and the part before it is one of `api`, `access`, `private`, `signing` (`SENSITIVE_KEY_QUALIFIERS`, a `ReadonlySet`), or
- any part is `authorization` or `jwt` (add both to `SENSITIVE_KEY_PARTS`).

Keep the function a single pass over `parts`; no regex. Do not add `key` alone (that would mask `cache-key`, `idempotency-key`, `monkey-key`) and do not add `id` or `session` as parts.

Tests in `describe('isSensitiveKey')`:

- true: `x-goog-api-key`, `stripeApiKey`, `openai_api_key`, `accessKey`, `X-Access-Key`, `signingKey`, `x-authorization`, `jwt`, `userJwt`.
- not covered on purpose (do not test as true): `private_key_pem` (last part is `pem`).
- false: `cache-key`, `idempotency-key`, `monkey-key`, `keyboard`, `x-request-id`, `session-count`.
- Through the public surface: `redactRequest(new Request('http://h/?x-goog-api-key=abc&q=1'), undefined)` masks the query value and keeps `q=1` (look at how the existing query-param tests read the result and match that), and `redact({ stripeApiKey: 'sk_x', name: 'ok' })` → `{ stripeApiKey: '[REDACTED]', name: 'ok' }`.

**Verify**: `cd packages/logixlysia && bun test __tests__/utils/redact.test.ts` → `0 fail`. Also run the whole suite once here: adapters and plugin tests log headers and query strings, and a widened matcher could change an existing expectation. If one does, read it: if the test's key is a credential by the rule above, update the expectation; if it is a benign key now masked, STOP and report the key.

Commit: `fix(redact): mask vendor-prefixed API keys, access keys and jwt fields`.

### Step 4: Changeset, full gates

Create `.changeset/redaction-proto-and-api-key-family.md` (`'logixlysia': patch`): `autoRedact` now masks keys ending in `api-key`, `access-key`, `private-key` or `signing-key` under any prefix (such as `x-goog-api-key` or `stripeApiKey`) and keys containing `authorization` or `jwt`; a logged object or merged context with an own `__proto__` key keeps it as a key instead of re-parenting the copy.

**Verify**: `bun run format && bun run lint && bun run typecheck && (cd packages/logixlysia && bun test)` → all exit 0, `0 fail`.

## Test plan

Listed per step: two `__proto__` tests for `redact`, one for `mergeContext`, a true/false table for `isSensitiveKey`, and two end-to-end checks through `redactRequest` and `redact`. Model them on the existing tests in the same `describe` blocks.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun test` → `0 fail`, at least 728 tests
- [ ] `grep -c "result\[" packages/logixlysia/src/utils/redact.ts` → `0`
- [ ] `grep -c "Object.assign" packages/logixlysia/src/context/request-context.ts` → `0`
- [ ] `git diff --stat 5115bea..HEAD` lists only the five in-scope paths

## STOP conditions

- The excerpts do not match the live file.
- A pre-existing test outside `redact.test.ts` masks a benign key after Step 3 (report the key and the test).
- The `entries` rewrite changes key order or the same-reference return for unchanged records (an existing test will say so).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- `redactKeys` in the config remains the escape hatch for anything the rule misses; `buildPinoRedactPaths` is unchanged and still covers only `DEFAULT_REDACT_KEYS` plus `redactKeys` for `logger.pino`.
- Reviewer: read the false-table carefully; the rule must not mask `idempotency-key`, which clients send on every retried POST.
- Follow-up, not in this plan: the docs page that lists the matching rule (under `apps/docs/content`) should mention the qualifier rule once the docs branch in flight has merged.
