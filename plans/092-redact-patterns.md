# Plan 092: `redactPatterns` masks values only you know the shape of

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report. A reviewer dispatched you and maintains `plans/README.md`, so do not edit the index.
>
> **Drift check (run first)**: `git diff --stat 0873da0..HEAD -- packages/logixlysia/src/utils/redact.ts packages/logixlysia/src/logger/emit.ts packages/logixlysia/src/config/resolve-options.ts packages/logixlysia/src/types/config.ts`. If a file changed, compare the excerpts below with the live code; a mismatch is a STOP condition. `types/config.ts` may have gained `minLevel` from plan 089 in another branch; that is unrelated.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `0873da0`, 2026-11-06

## Why this matters

`autoRedact` masks a closed list of shapes: email, IP, card, JWT, URL password and Bearer/Basic credentials. `redactKeys` adds key names only. A customer id such as `cust_abc123` or a Thai national ID inside a message or a URL has no way to be masked except an on-device model. A small list of regexes closes that.

## Current state

`packages/logixlysia/src/utils/redact.ts:187`:

```ts
export const redactString = (text: string): string => {
  let result = text

  result = result.replaceAll(URL_PASSWORD_REGEX, ...)
  result = result.replaceAll(EMAIL_REGEX, REDACTED_TEXT)
  ...
  return result
}
```

Every walker and URL helper in that file threads `extraKeys?: readonly string[]` (`walker.array`, `walker.error`, `walker.map`, `walker.record`, `walker.value`, `redactRequestUrl`, `redactSearchParams`, `redactHeaders`, `redactHeaderValue`, `redact`, `redactRequest`) and calls `redactString(x)` with no second argument. `redactPathSegment` is passed straight to `.map`:

```ts
u.pathname = u.pathname.split('/').map(redactPathSegment).join('/')
```

so adding a second parameter would receive the array index. That is a trap.

`packages/logixlysia/src/logger/emit.ts:152`:

```ts
const logData =
  config?.autoRedact === true
    ? redact(dataWithContext, config?.redactKeys)
    : dataWithContext
const logRequest =
  config?.autoRedact === true
    ? redactRequest(request, config?.redactKeys)
    : request
```

`packages/logixlysia/src/config/resolve-options.ts:296`, `resolveOptions` merges a preset, runs `validateX(resolved.config)` functions (exemplar: `validateRequestId`), and returns `resolved`. The plugin and `createLogger` both go through it (`src/index.ts:328`, `src/logger/index.ts:272`). The `prod` preset sets `autoRedact: true`.

Measured facts on Bun 1.3.14: a non-global regex makes `replaceAll` throw `TypeError`; a `gy` regex silently matches nothing, which is a leak; numbers and object keys are not scanned, the same as the built-in patterns. `store.pino` redacts by path only and is unaffected.

## Commands you will need

| Purpose   | Command                                               | Expected |
| --------- | ----------------------------------------------------- | -------- |
| Install   | `bun install --frozen-lockfile`                       | exit 0   |
| Lint      | `bun run lint`                                        | exit 0   |
| Format    | `bun run format`                                      | exit 0   |
| Typecheck | `bun run typecheck`                                   | exit 0   |
| Tests     | `cd packages/logixlysia && bun run build && bun test` | all pass |

## Scope

**In scope**: `packages/logixlysia/src/utils/redact.ts`, `src/logger/emit.ts`, `src/config/resolve-options.ts`, `src/types/config.ts` (`RedactionConfig` only), `__tests__/utils/redact.test.ts`, `__tests__/config/*` (the resolve-options test file), `apps/docs/content/configuration.mdx`, `.changeset/redact-patterns.md` (create).

**Out of scope**: `replacement` functions, opt-in built-in pattern sets, phone or IBAN built-ins (all rejected), `src/logger/index.ts` and `buildPinoRedactPaths` (pino redacts by path), scanning numbers or keys, and `AGENTS.md` (turbo appends a block to it; run `git checkout -- AGENTS.md` before committing and stage by path).

## Git workflow

Branch `improve/092-redact-patterns` from the worktree HEAD. Conventional commits with no attribution trailer, e.g. `feat(redact): mask custom value shapes with redactPatterns`. Do not push.

## Steps

### Step 1: One rules object

In `redact.ts`, add:

```ts
export interface RedactRules {
  keys?: readonly string[]
  patterns?: readonly RegExp[]
}
```

Replace the `extraKeys?: readonly string[]` parameter with `rules?: RedactRules` in every internal function named above. Pass `rules?.keys` to `isSensitiveKey`, which keeps its signature. Do not change behaviour yet.

Change `redactString` to `(text: string, patterns?: readonly RegExp[]): string`, applying user patterns first, so built-ins never re-match the mask:

```ts
let result = text
for (const pattern of patterns ?? []) {
  result = result.replaceAll(pattern, REDACTED_TEXT)
}
```

Pass `rules?.patterns` at every `redactString` call in the file, including `redactUrlAuthoritySegment`, `redactPathSegment`, the hash, `redactHeaderValue` and the walkers. Change the path line to `.map(segment => redactPathSegment(segment, rules))`. `grep -n "redactString(" packages/logixlysia/src/utils/redact.ts` must show `patterns` on every call inside a function that has `rules`.

Update `emit.ts`. Build the rules only under `autoRedact`:

```ts
const redactRules =
  config?.autoRedact === true
    ? { keys: config.redactKeys, patterns: config.redactPatterns }
    : undefined
```

Use it for `redact` and `redactRequest` in place of the two ternary conditions, keeping them readable. Existing tests calling `redact(value, ['key'])` change to `redact(value, { keys: ['key'] })`.

**Verify**: `bun run typecheck` exits 0 after adding the config field in Step 2. Do Step 2's type before running it.

### Step 2: The option

In `types/config.ts`, in `RedactionConfig`:

```ts
/**
 * Extra value shapes to mask when `autoRedact` is on, e.g. `/cust_[a-z0-9]+/`.
 * Runs on every string a record carries, and on each URL path segment, each
 * decoded query value and each header value, so a pattern cannot span a `/`.
 * Numbers and object keys are not scanned. Does not apply to `store.pino`.
 */
redactPatterns?: RegExp[]
```

In `resolve-options.ts`, add `normalizeRedactPatterns`, called from `resolveOptions` after the validators, returning a config with the normalized list. Keep it idempotent, because options may pass through twice.

- Empty or absent list: return `resolved` unchanged.
- Any entry that is not a `RegExp`: throw `logixlysia: invalid redactPatterns — ...`.
- `autoRedact !== true` on the resolved config: throw `logixlysia: invalid redactPatterns — needs autoRedact: true`, since it would otherwise be silently inert.
- A pattern that matches the empty string: throw the same prefix with the pattern's source; `replaceAll` would insert a mask between every character. Test with a non-global, non-sticky copy.
- Otherwise build `new RegExp(source, flags)` with `y` removed and `g` added.

**Verify**: `bun run typecheck` exits 0, and `cd packages/logixlysia && bun test __tests__/utils/redact.test.ts` passes.

### Step 3: Tests

`__tests__/utils/redact.test.ts`:

1. `redact({ note: 'buyer cust_abc123' }, { patterns: [/cust_[a-z0-9]+/g] })` masks it, nested in an object, an array, and an `Error` message and stack.
2. `redactRequest` masks a path segment, a query value and a header value matching the pattern.
3. A user pattern matching text that a built-in also matches leaves one `[REDACTED]`.
4. A path keeps its other segments and `/` separators, proving the `.map` trap is handled.

The resolve-options test file:

5. A non-global regex comes back with `g`. A `gy` regex comes back with `g` and no `y`. Resolving twice gives the same flags.
6. A pattern without `autoRedact` throws. With `preset: 'prod'` it does not.
7. `/x*/` throws. A string entry throws (cast through `unknown`, not `any`).

Plugin level, in the same redact test file or a new `__tests__/logger/redact-patterns.test.ts`:

8. `logixlysia({ config: { autoRedact: true, redactPatterns: [/cust_[a-z0-9]+/], transports: [capture] } })`, with a non-global regex: `log.info('order for cust_abc123')` reaches the transport masked, and the record is not lost.

**Verify**: the new tests pass.

### Step 4: Docs and changeset

In `configuration.mdx`, add a `### \`redactPatterns\``section after`### \`redactKeys\``(line 106) with the example and the limits from the JSDoc. Create`.changeset/redact-patterns.md`with`'logixlysia': minor`.

**Verify**: `bun run format`, then `bun run lint` exits 0.

## Test plan

Step 3. Existing redaction tests stay green, with only the argument shape changed.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0.
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the new tests. The API snapshot is unchanged, since no runtime export was added.
- [ ] `grep -n "extraKeys" packages/logixlysia/src/utils/redact.ts` shows only `isSensitiveKey`'s own parameter and `buildPinoRedactPaths`.
- [ ] `git status` shows only in-scope files; `AGENTS.md` is unchanged.

## STOP conditions

- `redact`, `redactRequest` or `redactString` turns out to be reachable from a public export (the API snapshot would change).
- A test outside redaction fails because of the signature change.

## Maintenance notes

A user regex runs on every string of every record, so a slow one costs on the hot path; the docs say so by keeping the example simple, and this stays the operator's call. Any new `redactString` call in this file must pass the patterns.
