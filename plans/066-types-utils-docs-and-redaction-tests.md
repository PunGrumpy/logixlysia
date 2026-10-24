# Plan 066: Types and utils: delete 17 comment lines, correct six docs, and replace five explanatory comments with names and tests

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7dea942..HEAD -- packages/logixlysia/src/types/enricher.ts packages/logixlysia/src/types/config.ts packages/logixlysia/src/types/logger.ts packages/logixlysia/src/utils/error.ts packages/logixlysia/src/utils/redact.ts packages/logixlysia/src/utils/sanitize.ts packages/logixlysia/src/utils/json.ts packages/logixlysia/src/utils/duration.ts packages/logixlysia/__tests__/utils/redact.test.ts` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `7dea942`, 2026-10-24

## Why this matters

Six public or near-public docs in this slice say something the code does not do. The `requestId` option doc promises to honor any upstream ID and to generate a UUID only "if no header is present", while the middleware rejects IDs that are not 1-128 characters of `A-Za-z0-9._-` and replaces them; a user debugging a dropped proxy ID has no doc to find. `redactRequest` says it "intentionally omits the body" while it returns the original request, body included, when nothing needed redacting. `URL_SAFE_REDACT` says userinfo cannot hold `[`, which is false (it is percent-encoded). `LogFields` tells users to "widen" a type alias. `elapsedMs` documents a `BigInt(0)` sentinel that has been `0n` since the oxlint migration.

Five more comments explain code that a name or a test can carry: two parallel arrays that must move in lockstep, a credential heuristic described on the regex while it lives in a callback, a pass-ordering constraint no test pins, an identity rule for redacted errors no test pins, and a `toJSON` self-return branch no test exercises. Each is replaced with the smaller thing: one record type, one named predicate, one named boolean, three tests. The rest is restatement.

## Current state

### Deletions (Appendix B, 5 ranges, 17 lines, 5 files)

- `src/types/enricher.ts:6` `/** Elapsed time for the request in milliseconds. */` on `durationMs: number`: restates the name and type.
- `src/utils/error.ts:81-82`: narrates the `typeof error.response === 'string'` ternary; the privacy rule is pinned by `__tests__/plugin/status-resolution.test.ts:128` `logs the status text instead of an object body`.
- `src/utils/redact.ts:6-11`: the IPv6 doc restates the two shapes the regex accepts; the clock-time and MAC-address cases it mentions are pinned by `redact.test.ts:665-678`.
- `src/utils/sanitize.ts:3-6`: restates the numeric ranges in `isControlCodePoint`.
- `__tests__/utils/redact.test.ts:532-535`: Bun `<=1.2.x` history under a test whose title names the scenario.

### Docs to correct

`packages/logixlysia/src/types/config.ts:248-249` (inside the `requestId` option doc):

```ts
   * 1. Read `X-Request-Id` (or custom header) from the incoming request — honoring IDs set by upstream proxies.
   * 2. Generate a new UUID if no header is present.
```

`packages/logixlysia/src/types/config.ts:124-128`:

```ts
  /**
   * Custom ID generator function.
   * @default crypto.randomUUID()
   */
  generator?: () => string
```

The middleware, `packages/logixlysia/src/middleware/request-id.ts:5`, is `const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/u`; line 77 accepts an inbound value only if it matches, and the `getOrCreateRequestId` doc (lines 59-71) says a generator result "must pass the same check" and is "reported and replaced with a random UUID" otherwise.

`packages/logixlysia/src/types/logger.ts:60`:

```ts
/** The shape of a request's context bag. Widen it per app to type your fields. */
export type LogFields = Record<string, unknown>
```

The doc under it (line 63 onwards) says "Parameterise the plugin with your own field type"; `LogFields` is the default, not something a caller widens.

`packages/logixlysia/src/utils/duration.ts:3-6`:

```ts
/**
 * Milliseconds elapsed since `beforeTime`, or `0` when no start was recorded
 * (`BigInt(0)` is the plugin's "never started" sentinel).
 */
```

The code under it compares `beforeTime === 0n`; `0n` is also what `src/index.ts` and `src/logger/index.ts` write.

`packages/logixlysia/src/utils/redact.ts:617-622`:

```ts
/**
 * Clone request URL, method and headers for logging with the same string redaction as {@link redact}.
 * The returned request is a logging-only artifact carrying url/method/headers/signal; it intentionally
 * omits the body so it never re-uses the original (possibly already-consumed) request stream. The
 * original request is left untouched and remains usable.
 */
```

Lines 643-645 of the same function: `if (!(urlChanged || headersChanged || methodChanged)) { return request }`.

`packages/logixlysia/src/utils/redact.ts:201-203`:

```ts
/**
 * Host and userinfo cannot contain `[REDACTED]` — `[` begins an IPv6 literal in URLs and breaks parsing.
 */
const URL_SAFE_REDACT = 'redacted'
```

On Bun 1.3.14 and Node 24, `u.username = '[REDACTED]'` yields `http://%5BREDACTED%5D@a.com/`; only `u.hostname = '[REDACTED]'` is rejected (left unchanged).

### Comments to replace with code or tests

`packages/logixlysia/src/utils/json.ts:45-49` and the two sites that use the arrays, lines 66-69 and 73-79:

```ts
// The object each open level serializes (what `this` is for its children),
// beside the value it came from, which is what a cycle refers back to.
const ancestors: unknown[] = []
const origins: unknown[] = []
const seen = new Set<unknown>()
```

```ts
while (ancestors.length > 0 && ancestors.at(-1) !== this) {
  ancestors.pop()
  seen.delete(origins.pop())
}
```

```ts
if (ancestors.length >= MAX_DEPTH) {
  return DEPTH_TEXT
}
const plain = toJsonShape(current)
ancestors.push(plain)
origins.push(current)
seen.add(current)
```

`packages/logixlysia/src/utils/redact.ts:31-40`:

```ts
/**
 * An HTTP credential after its scheme word. Only a token with a digit, a
 * URL-safe punctuation mark or an uppercase letter after a word character is
 * masked, so prose such as "Basic authentication failed" is left alone.
 */
const HTTP_CREDENTIAL_REGEX =
  /\b(?<scheme>[Bb]earer|[Bb]asic)\s+(?<token>[\w\-.~+/]{8,}=*)/gu
const CREDENTIAL_MARK_REGEX = /[\d\-.~+/]/u
/** No `i` flag, under which `[A-Z]` would match every lowercase letter too. */
const INNER_CAPITAL_REGEX = /\w[A-Z]/u
```

and its use in `redactString`, lines 189-195:

```ts
result = result.replace(
  HTTP_CREDENTIAL_REGEX,
  (match: string, scheme: string, token: string) =>
    CREDENTIAL_MARK_REGEX.test(token) || INNER_CAPITAL_REGEX.test(token)
      ? `${scheme} ${REDACTED_TEXT}`
      : match
)
```

`redact.test.ts:82-90` pins that "Basic authentication failed" is left alone.

`packages/logixlysia/src/utils/redact.ts:176-185` (the start of `redactString`):

```ts
export const redactString = (text: string): string => {
  let result = text

  // Before the email pass, which would otherwise eat `password@host.tld`.
  result = result.replace(
    URL_PASSWORD_REGEX,
    (match: string, prefix: string, offset: number, whole: string) =>
      endsWithUrlScheme(whole, offset) ? `${prefix}${REDACTED_TEXT}@` : match
  )
  result = result.replace(EMAIL_REGEX, REDACTED_TEXT)
```

The existing URL-password tests (`redact.test.ts:66-70`, `:112`) use hosts without a TLD (`db:5432`), so they pass in either pass order; nothing pins the order today.

`packages/logixlysia/src/utils/redact.ts:360-363`:

```ts
  // Errors are exempt from the identity fast path: a redacted Error is always constructed
  // fresh (even when nothing changed) so consumers never receive the original, potentially
  // stack-trace-carrying instance by reference.
  error: (
```

No test asserts that an unchanged Error comes back as a new instance.

`packages/logixlysia/src/utils/redact.ts:515-518` (inside `walker.toJson`):

```ts
    if (plain === value) {
      // A toJSON that returns its own object: the guard already holds it,
      // so walk its keys directly instead of answering "[Circular]".
      return walker.record(
```

The existing `toJSON` tests (`redact.test.ts:295-312`) return a new object from `toJSON`; none returns `this`.

### Test file facts

`packages/logixlysia/__tests__/utils/redact.test.ts:1-8` imports `describe, expect, test` from `bun:test` and `buildPinoRedactPaths, isSensitiveKey, redact, redactRequest, redactString` from `../../src/utils/redact`. Tests are flat `test(...)` calls inside `describe` blocks; follow the style of `masks the password of a URL in free text` (line 66) and `walks the output of toJSON` (line 295). `apiKey` is a sensitive key (the test at line 295 expects it redacted).

### Repo facts

- Bun 1.3.14 workspaces with Turborepo. The published package is `packages/logixlysia`, an Elysia logging plugin. `src/types/config.ts` and `src/types/logger.ts` docs reach users through `dist/index.d.ts`.
- `origin/main` is `7dea942` ("Version Packages (#524)"). A local `main` may lag behind it; this plan is written against `7dea942` and the branch must start there.
- Lint and format are Ultracite (oxlint and oxfmt). `bun run lint` runs both and fails on any finding. Rules that shape this plan:
  - `no-empty` is an error: the comment-only `catch` blocks in `utils/report.ts` and `utils/settle.ts` stay.
  - `typescript/consistent-type-definitions` is an error: object types are `interface`.
  - `func-style` (arrow functions) and `no-use-before-define` are errors: define a helper above its first use.
  - `promise/prefer-await-to-then` is an error in `src/` and off under `__tests__/`.
  - Never turn a rule off and never add an `oxlint-disable` comment. If lint rejects a change, restructure the code. If you cannot, STOP.
- `turbo` appends a block marked `<!-- BEGIN:turborepo-agent-rules -->` to `AGENTS.md` when it detects an AI agent. That change is not part of this plan: run `git checkout -- AGENTS.md` before every commit and never stage `AGENTS.md`.
- The repo signs commits through 1Password, which an agent session cannot reach. Commit with `git -c commit.gpgsign=false commit ...` and say so in your report.

## Commands you will need

| Purpose | Command (worktree root unless noted) | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | `710 pass`, `0 fail` at `7dea942`; `713 pass`, `0 fail` when this plan is done |
| Utils tests | `cd packages/logixlysia && bun test __tests__/utils` | all pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/types/enricher.ts`
- `packages/logixlysia/src/types/config.ts`
- `packages/logixlysia/src/types/logger.ts`
- `packages/logixlysia/src/utils/error.ts`
- `packages/logixlysia/src/utils/redact.ts`
- `packages/logixlysia/src/utils/sanitize.ts`
- `packages/logixlysia/src/utils/json.ts`
- `packages/logixlysia/src/utils/duration.ts`
- `packages/logixlysia/__tests__/utils/redact.test.ts`
- `.changeset/utils-docs-second-pass.md` (create)

**Out of scope** (do NOT touch):

- `src/types/config.ts:13-20` (the `Transport.flush` doc): judged correct in the first sweep; "writes durably" there means the write completes before `log()` resolves.
- `src/utils/redact.ts:1` (the email regex bounds): RFC-sourced limits stay. Lines 15-27, 39, 115, 254-256, 294-295, 372-374, 389-390, 408-409, 552-553: platform facts that stay. Line 312 (`let depth`): the redaction depth counter is a backlog item.
- `src/utils/json.ts:54` (the `function`-not-arrow comment on the replacer): a language fact that stays.
- `src/output/**`, `src/sampling/**`, `src/types/core.ts` and every other test file.
- Changing `StoreData.beforeTime` to `bigint | undefined`: backlog.

## Git workflow

- Branch: `improve/066-types-utils-docs-and-redaction-tests`, created in Step 0 from `7dea942`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log`.
- Commit with `git -c commit.gpgsign=false commit -m "<subject>"`.
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git rev-parse --short origin/main` → `7dea942`. If not, STOP.
2. `git switch -c improve/066-types-utils-docs-and-redaction-tests 7dea942`. If that branch already exists, STOP.
3. `bun install --frozen-lockfile` → exit 0.
4. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
5. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `710 pass`, `0 fail`. If any fails before you changed anything, STOP.
6. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

1. `mkdir -p /tmp/prune-066`. Save Appendix A verbatim as `/tmp/prune-066/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-066/spec.txt`.
2. From the worktree root: `bun /tmp/prune-066/prune-comments.ts /tmp/prune-066/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `7dea942`: STOP and report it.
3. `bun /tmp/prune-066/prune-comments.ts /tmp/prune-066/spec.txt` → `removed 17 comment lines across 5 files`.
4. `bun run format` → exit 0. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `710 pass`, `0 fail`.
5. `git checkout -- AGENTS.md`. `git status --short` lists only the five files in Appendix B.
6. **Commit**: `chore(utils): drop comments the code and tests already state`

### Step 2: Document how request ids are validated

In `packages/logixlysia/src/types/config.ts`:

1. Replace the two numbered lines in the `requestId` doc

```ts
   * 1. Read `X-Request-Id` (or custom header) from the incoming request — honoring IDs set by upstream proxies.
   * 2. Generate a new UUID if no header is present.
```

with

```ts
   * 1. Read `X-Request-Id` (or custom header) from the incoming request, honoring an upstream ID that is 1-128 characters of `A-Z a-z 0-9 . _ -`.
   * 2. Generate a new UUID when the header is absent or fails that check. A `generator` result is held to the same check and replaced with a UUID when it fails.
```

2. Replace the `generator` doc

```ts
/**
 * Custom ID generator function.
 * @default crypto.randomUUID()
 */
```

with

```ts
/**
 * Custom ID generator function. Its result must be 1-128 characters of
 * `A-Z a-z 0-9 . _ -`; anything else is reported through `onError` and
 * replaced with `crypto.randomUUID()`.
 * @default crypto.randomUUID()
 */
```

**Verify**: `grep -c 'A-Za-z0-9._-' packages/logixlysia/src/middleware/request-id.ts` → `1` (the rule you documented). `bun run build --filter logixlysia` → exit 0; `grep -c 'held to the same check' packages/logixlysia/dist/index.d.ts` → `1`.

**Commit**: `docs(config): document how request ids are validated`

### Step 3: Correct four utility docs

1. `packages/logixlysia/src/types/logger.ts`: replace the `LogFields` doc line with

```ts
/** The default shape of a request's context bag. Pass your own interface to `logixlysia<TFields>()` to type your fields. */
```

2. `packages/logixlysia/src/utils/duration.ts`: in the `elapsedMs` doc, replace ``(`BigInt(0)` is the plugin's "never started" sentinel).`` with ``(`0n` is the plugin's "never started" sentinel).``.

3. `packages/logixlysia/src/utils/redact.ts`: replace the `redactRequest` doc with

```ts
/**
 * Clone request URL, method and headers for logging with the same string redaction as {@link redact}.
 * When nothing needed redacting the original request is returned. Otherwise the result is a
 * logging-only artifact carrying url/method/headers/signal and no body, so it never re-uses the
 * original (possibly already-consumed) request stream. The original request is left untouched.
 */
```

4. `packages/logixlysia/src/utils/redact.ts`: replace the `URL_SAFE_REDACT` doc with

```ts
/**
 * The host cannot hold `[REDACTED]`: `[` opens an IPv6 literal. Userinfo would
 * percent-encode it, so one bracket-free token serves both.
 */
```

**Verify**: `bun run lint` → exit 0. `grep -c 'BigInt(0)' packages/logixlysia/src/utils/duration.ts` → `0`. `grep -c 'Widen it per app' packages/logixlysia/src/types/logger.ts` → `0`.

**Commit**: `docs(utils): correct the redactRequest, URL_SAFE_REDACT, LogFields and elapsedMs docs`

### Step 4: Track each open JSON level as one record

In `packages/logixlysia/src/utils/json.ts`:

1. Above `export const stringifyForLog` (after the constants that precede its doc, and before the doc), add

```ts
interface OpenLevel {
  origin: unknown
  plain: unknown
}
```

2. Replace

```ts
// The object each open level serializes (what `this` is for its children),
// beside the value it came from, which is what a cycle refers back to.
const ancestors: unknown[] = []
const origins: unknown[] = []
const seen = new Set<unknown>()
```

with

```ts
const levels: OpenLevel[] = []
const seen = new Set<unknown>()
```

3. Replace

```ts
while (ancestors.length > 0 && ancestors.at(-1) !== this) {
  ancestors.pop()
  seen.delete(origins.pop())
}
```

with

```ts
while (levels.length > 0 && levels.at(-1)?.plain !== this) {
  seen.delete(levels.pop()?.origin)
}
```

4. Replace

```ts
if (ancestors.length >= MAX_DEPTH) {
  return DEPTH_TEXT
}
const plain = toJsonShape(current)
ancestors.push(plain)
origins.push(current)
seen.add(current)
```

with

```ts
if (levels.length >= MAX_DEPTH) {
  return DEPTH_TEXT
}
const plain = toJsonShape(current)
levels.push({ origin: current, plain })
seen.add(current)
```

5. `bun run format`, `bun run lint`, `bun run typecheck` → exit 0. `cd packages/logixlysia && bun test` → `710 pass`, `0 fail` (cycle, depth and `toJSON` cases for `stringifyForLog` live under `__tests__/utils` and `__tests__/output`).

**Commit**: `refactor(json): track each open level as one record`

**Verify**: `grep -c 'ancestors\|origins' packages/logixlysia/src/utils/json.ts` → `0`.

### Step 5: Name the rule that tells a credential from prose

In `packages/logixlysia/src/utils/redact.ts`:

1. Delete the five-line `/** ... */` doc above `HTTP_CREDENTIAL_REGEX` (the one that starts "An HTTP credential after its scheme word").
2. Directly after the line `const INNER_CAPITAL_REGEX = /\w[A-Z]/u`, add

```ts
const looksLikeCredential = (token: string): boolean =>
  CREDENTIAL_MARK_REGEX.test(token) || INNER_CAPITAL_REGEX.test(token)
```

3. In `redactString`, replace

```ts
;(match: string, scheme: string, token: string) =>
  CREDENTIAL_MARK_REGEX.test(token) || INNER_CAPITAL_REGEX.test(token)
    ? `${scheme} ${REDACTED_TEXT}`
    : match
```

with

```ts
;(match: string, scheme: string, token: string) =>
  looksLikeCredential(token) ? `${scheme} ${REDACTED_TEXT}` : match
```

4. `bun run format`, `bun run lint`, `bun run typecheck` → exit 0. `cd packages/logixlysia && bun test __tests__/utils/redact.test.ts` → all pass.

**Commit**: `refactor(redact): name the rule that tells a credential from prose`

### Step 6: Pin the pass order with a test and drop the comment

1. In `packages/logixlysia/src/utils/redact.ts`, delete the line `  // Before the email pass, which would otherwise eat \`password@host.tld\`.`inside`redactString`. The code order does not change.
2. In `packages/logixlysia/__tests__/utils/redact.test.ts`, directly after the test `masks the password of a URL in free text` (its closing `})`), add

```ts
test('masks a URL password before the email pass can eat it, even with a dotted host', () => {
  expect(
    redactString('dsn postgres://app:hunter2@db.internal.example/main')
  ).toBe('dsn postgres://app:[REDACTED]@db.internal.example/main')
})
```

3. `bun run format` → exit 0. `cd packages/logixlysia && bun test __tests__/utils/redact.test.ts` → all pass, one more test than before.
4. Prove the test pins the order: in `redactString`, temporarily move the `result = result.replace(EMAIL_REGEX, REDACTED_TEXT)` line above the `URL_PASSWORD_REGEX` replace, run `bun test __tests__/utils/redact.test.ts` → the new test fails (the email pass eats `hunter2@db.internal.example`). Move the line back. Run again → all pass. If the test does not fail with the order swapped, STOP and report.

**Commit**: `test(redact): pin that URL passwords are masked before the email pass`

### Step 7: Pin that a redacted Error is always a fresh instance

1. In `packages/logixlysia/src/utils/redact.ts`, delete the three-line comment above `error: (` in the `walker` object (the one that starts "Errors are exempt from the identity fast path").
2. In `redact.test.ts`, directly after the test `changed objects still return new references and leave the original unmutated`, add

```ts
test('a redacted Error is never the original instance, even when nothing changed', () => {
  const original = new Error('nothing sensitive')
  const result = redact({ error: original }) as { error: Error }
  expect(result.error).not.toBe(original)
  expect(result.error).toBeInstanceOf(Error)
  expect(result.error.message).toBe('nothing sensitive')
})
```

3. `bun run format` → exit 0. `cd packages/logixlysia && bun test __tests__/utils/redact.test.ts` → all pass.

**Commit**: `test(redact): pin that a redacted Error is always a fresh instance`

### Step 8: Name the toJSON self-return case and pin it

1. In `packages/logixlysia/src/utils/redact.ts`, inside `walker.toJson`, replace

```ts
    if (plain === value) {
      // A toJSON that returns its own object: the guard already holds it,
      // so walk its keys directly instead of answering "[Circular]".
      return walker.record(
```

with

```ts
    const toJsonReturnedItself = plain === value
    if (toJsonReturnedItself) {
      return walker.record(
```

2. In `redact.test.ts`, directly after the test `walks the output of toJSON`, add

```ts
test('walks a toJSON that returns its own object instead of reporting a cycle', () => {
  const self = {
    apiKey: 'k-1',
    toJSON() {
      return this
    }
  }
  const out = redact({ self }) as { self: { apiKey: string } }
  expect(out.self.apiKey).toBe('[REDACTED]')
})
```

3. `bun run format`, `bun run lint`, `bun run typecheck` → exit 0. `cd packages/logixlysia && bun test __tests__/utils/redact.test.ts` → all pass. If the new test reports `[Circular]` instead of a redacted key, STOP: the branch does not do what its comment said, and that is a finding, not something to patch here.

**Commit**: `refactor(redact): name the toJSON self-return case and pin it with a test`

### Step 9: Add the changeset

Create `.changeset/utils-docs-second-pass.md`:

```md
---
'logixlysia': patch
---

The `requestId` and `generator` docs now state the validation rule (1-128 characters of `A-Z a-z 0-9 . _ -`) and the UUID fallback that applies when an inbound or generated ID fails it. `redactRequest`'s doc says the original request is returned when nothing needed redacting. `LogFields` is documented as the default field shape. No behavior change.
```

**Commit**: `chore: add a changeset for the request-id and redaction docs`

### Step 10: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `713 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B 7dea942..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff 7dea942..HEAD | grep -c '^+.*oxlint-disable'` → `0`.
8. `git diff --name-only 7dea942..HEAD` lists only files from the Scope section.

## Test plan

- Three new tests in `__tests__/utils/redact.test.ts`, each replacing a comment: the URL-password pass order (with a mutation check in Step 6), the fresh-Error identity rule, and the `toJSON` self-return branch. Model them on the neighbouring tests named in each step.
- Verification: `cd packages/logixlysia && bun test` → `713 pass`.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `713 pass`, `0 fail`
- [ ] `grep -c 'ancestors' packages/logixlysia/src/utils/json.ts` → `0`
- [ ] `grep -c 'looksLikeCredential' packages/logixlysia/src/utils/redact.ts` → `2`
- [ ] `grep -c 'toJsonReturnedItself' packages/logixlysia/src/utils/redact.ts` → `2`
- [ ] `grep -c 'Before the email pass\|Errors are exempt from the identity fast path\|A toJSON that returns its own object' packages/logixlysia/src/utils/redact.ts` → `0`
- [ ] `grep -c 'held to the same check' packages/logixlysia/dist/index.d.ts` → `1` after `bun run build`
- [ ] `git diff --name-only 7dea942..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `7dea942`).
- A verification fails twice after a reasonable fix attempt.
- The Step 6 mutation check does not fail, or the Step 8 test reports `[Circular]`.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.

## Maintenance notes

- `redactString` runs its passes in a fixed order; the new test fails if the URL-password pass moves below the email pass.
- If `VALID_REQUEST_ID` in `src/middleware/request-id.ts` changes, update both docs in `src/types/config.ts` in the same change.
- Deferred on purpose (recorded in `plans/README.md`'s refactor backlog): `StoreData.beforeTime` as `bigint | undefined` instead of the `0n` sentinel; threading the redaction depth instead of the module-level counter; `FileSinkImpl.latestOptions`.

## Appendix A: `prune-comments.ts`

```ts
// Deletes exact comment line ranges listed in a spec, bottom-up per file.
// Spec lines: <path>|<start>|<end>|<expected prefix of the trimmed start line>
// Usage: bun prune-comments.ts <spec-file> [--dry-run]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [specPath, flag] = process.argv.slice(2)
if (!specPath) {
  console.error('usage: bun prune-comments.ts <spec-file> [--dry-run]')
  process.exit(2)
}
const dryRun = flag === '--dry-run'
const root = process.cwd()

interface Range {
  end: number
  expected: string
  start: number
}

const byFile = new Map<string, Range[]>()
for (const raw of readFileSync(specPath, 'utf8').split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith(';')) {
    continue
  }
  const [file, start, end, ...rest] = line.split('|')
  const range = {
    end: Number(end),
    expected: rest.join('|').trim(),
    start: Number(start)
  }
  if (!file || !Number.isInteger(range.start) || range.end < range.start) {
    console.error(`bad spec line: ${raw}`)
    process.exit(2)
  }
  const list = byFile.get(file) ?? []
  list.push(range)
  byFile.set(file, list)
}

const LINE_MARKERS = ['//', '#']
const isBlank = (text: string | undefined): boolean =>
  text !== undefined && text.trim() === ''

const checkShape = (lines: string[]): string | undefined => {
  const first = lines[0]?.trim() ?? ''
  const last = lines.at(-1)?.trim() ?? ''
  const marker = LINE_MARKERS.find(m => first.startsWith(m))
  if (marker) {
    const stray = lines.find(l => !l.trim().startsWith(marker))
    return stray === undefined ? undefined : `non-comment line: ${stray.trim()}`
  }
  if (first.startsWith('/*') && last.endsWith('*/')) {
    return
  }
  if (first.startsWith('<!--') && last.endsWith('-->')) {
    return
  }
  return `range is not a whole comment: "${first}" ... "${last}"`
}

let failures = 0
const planned = new Map<string, { lines: string[]; ranges: Range[] }>()
for (const [file, ranges] of byFile) {
  const lines = readFileSync(path.join(root, file), 'utf8').split('\n')
  ranges.sort((a, b) => b.start - a.start)
  for (const range of ranges) {
    const slice = lines.slice(range.start - 1, range.end)
    const head = slice[0]?.trim() ?? ''
    const problem = head.startsWith(range.expected)
      ? checkShape(slice)
      : `expected "${range.expected}", found "${head}"`
    if (problem) {
      failures += 1
      console.error(`MISMATCH ${file}:${range.start}-${range.end}: ${problem}`)
    } else if (dryRun) {
      console.log(`${file}:${range.start}-${range.end}`)
      for (const text of slice) {
        console.log(`    ${text}`)
      }
    }
  }
  planned.set(file, { lines, ranges })
}

if (failures > 0) {
  console.error(`${failures} range(s) did not match. No file was changed.`)
  process.exit(1)
}
if (dryRun) {
  console.log('dry run ok')
  process.exit(0)
}

let removed = 0
for (const [file, { lines, ranges }] of planned) {
  for (const range of ranges) {
    lines.splice(range.start - 1, range.end - range.start + 1)
    if (isBlank(lines[range.start - 2]) && isBlank(lines[range.start - 1])) {
      lines.splice(range.start - 1, 1)
    }
    removed += range.end - range.start + 1
  }
  writeFileSync(path.join(root, file), lines.join('\n'))
}
console.log(`removed ${removed} comment lines across ${planned.size} files`)
```

## Appendix B: deletion spec (`path|start|end|expected start of the first line`)

```text
packages/logixlysia/src/types/enricher.ts|6|6|/** Elapsed time for the request in milliseconds
packages/logixlysia/src/utils/error.ts|81|82|// A string body becomes the message. Any other
packages/logixlysia/src/utils/redact.ts|6|11|/**
packages/logixlysia/src/utils/sanitize.ts|3|6|/**
packages/logixlysia/__tests__/utils/redact.test.ts|532|535|// The logging-only clone must not carry the ori
```
