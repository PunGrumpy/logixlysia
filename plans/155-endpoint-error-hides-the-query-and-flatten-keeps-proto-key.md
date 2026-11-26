# Plan 155: An invalid adapter endpoint is reported without its query string, and a flattened record keeps a `__proto__` key

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat be8daf5..HEAD -- packages/logixlysia/src/adapters/shared.ts` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `be8daf5`, 2026-11-26

## Why this matters

Two small defects in `src/adapters/shared.ts`, which every adapter runs through.

1. `resolveEndpoint` throws `invalid endpoint URL '<url>'` when the URL does not parse. It masks `user:password@`, but prints the query string. The most common unparseable endpoint is one written without its scheme (`logs.example.com/ingest?api_key=…`), and some intake APIs take their key in the query. That key then lands in the thrown message, which goes to stderr and to whatever error reporter the app has.
2. `flattenMeta` (used for ClickHouse, PostHog, Sentry and OTLP attributes) writes each leaf with `out[prefix] = value`. For a logged key named `__proto__` at the top level that assignment hits the prototype setter and the field vanishes without a trace. Logged data comes from request bodies, so the key is reachable.

## Current state

`packages/logixlysia/src/adapters/shared.ts:178-194`:

```ts
const URL_USERINFO = /^(?<scheme>[a-z][a-z0-9+.-]*:\/\/).*@/iu

const withoutCredentials = (url: string): string =>
  url.replace(URL_USERINFO, '$<scheme><redacted>@')

export const tryParseUrl = (value: string): URL | undefined =>
  URL.canParse(value) ? new URL(value) : undefined

export const resolveEndpoint = (name: string, url: string): string => {
  const parsed = tryParseUrl(url)
  if (!parsed) {
    throw transportError(
      name,
      `invalid endpoint URL '${withoutCredentials(url)}'`
    )
  }
```

Observed at `be8daf5`: `resolveEndpoint('x', 'ingest.example.com/v1?api_key=SECRETVALUE')` throws `[logixlysia] x transport: invalid endpoint URL 'ingest.example.com/v1?api_key=SECRETVALUE'`.

`packages/logixlysia/src/adapters/shared.ts:1042-1094` (`flattenInto`, four assignments of the form `out[prefix] = …`, and `flattenMeta`):

```ts
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    out[prefix] = value
    return
  }
  ...
export const flattenMeta = (
  meta: Record<string, unknown>
): Record<string, FlatValue> => {
  const out: Record<string, FlatValue> = {}
  flattenInto(out, meta, '', 0)
  return out
}
```

Observed at `be8daf5`: `flattenMeta(JSON.parse('{"a":1,"__proto__":"x","b":{"__proto__":"y"}}'))` returns `{"a":1,"b.__proto__":"y"}`; the top-level `__proto__` field is gone.

Existing tests: `packages/logixlysia/__tests__/adapters/shared.test.ts` has the userinfo test for `resolveEndpoint` (search for `redacted`) and the `flattenMeta` tests.

## Design (decided)

1. `withoutCredentials` also cuts everything from the first `?` or `#`: a URL with a query or fragment is shown as `<part before it>?<redacted>` (or `#<redacted>` when the first of the two is `#`). The userinfo masking stays. Apply the cut after the userinfo replacement. Check every other caller of `withoutCredentials` in the file (`rg -n withoutCredentials packages/logixlysia/src`): each one prints a URL in an error message, and each gets the same treatment by virtue of calling the function.
2. In `flattenInto`, replace the four `out[prefix] = x` writes with one small local helper that defines an own, enumerable, writable, configurable property (`Object.defineProperty`), so a `__proto__` key becomes an own key. `out` stays a normal object (`Object.getPrototypeOf(out) === Object.prototype`).

## Scope

**In scope**:

- `packages/logixlysia/src/adapters/shared.ts`
- `packages/logixlysia/__tests__/adapters/shared.test.ts`
- `.changeset/endpoint-error-query-and-proto-key.md` (create)

**Out of scope**:

- `packages/logixlysia/src/desertant.ts` (its error clone has a related `__proto__` assignment; not verified, not part of this plan).
- `snapshotMeta`, `stringifyForLog`, any adapter entry file.
- Error messages for a URL that parses (wrong protocol and so on): they do not print the URL.

## Commands you will need

Run everything from the repository root unless a row says otherwise. The shell may export `FORCE_COLOR` and `NO_COLOR` together, which makes unrelated color tests fail, so every command below clears both.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install (fresh worktree only) | `bun install --frozen-lockfile` | exit 0 |
| Lint + format check | `env -u FORCE_COLOR -u NO_COLOR bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` | exit 0 |
| Build the package | `cd packages/logixlysia && bun run build` | exit 0 |
| One test file | `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test <path>` | all pass |
| Full package suite | `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` | 0 fail (1517 pass at `be8daf5`; the API snapshot test needs `dist/`) |

Bun is 1.3.14. Tests use `bun:test`. Do not add dependencies.

## Repo conventions that apply

- Lint is Ultracite (Oxlint + Oxfmt), strict. Arrow functions, `const`, `for...of`, no `any`, no `console.log` in source, no nested ternaries, top-level regex literals. Run `bun run format` before you commit, then `bun run lint`.
- Comments: keep a comment only for a non-obvious _why_. Do not narrate what the code does, and do not delete existing comments you did not make obsolete.
- Tests live in `packages/logixlysia/__tests__/<area>/*.test.ts`, import from `../../src`, and assert on behaviour through the public API with literal expected values. Helpers are in `packages/logixlysia/__tests__/_helpers/` (`sleep.ts`, `tmp.ts`, `console.ts`).
- Any change under `packages/logixlysia/` needs a changeset: a new file `.changeset/<slug>.md` with front matter `'logixlysia': patch` (or `minor`) and one paragraph, written for a user of the package, that says what was wrong or missing and what happens now. Exemplar (`.changeset/file-sink-close-race.md`):

  ```md
  ---
  'logixlysia': patch
  ---

  A log line written while `flushLogixlysia(options, { close: true })` was running could reopen the log file while its sink was still registered, ... Such a line now keeps its sink registered, and the next close releases the descriptor.
  ```

- Docs prose (`apps/docs/content/**/*.mdx`, changesets, PR text): short declarative sentences, no long dashes, say what the software does. Never name any other logging library outside `apps/docs/content/comparison.mdx` and `apps/docs/content/migration-from-evlog.mdx`.

## Git workflow

- Branch: `fix/endpoint-error-query-and-proto-key`, cut from `origin/main`.
- Atomic commits, one logical unit each (for example: the fix with its tests, then the docs, then the changeset). Conventional commits with a body that says why. Example from `git log`: `fix(better-stack): accept an ingesting host without a scheme (#665)`.
- **No attribution of any kind**: no `Co-Authored-By`, no `Generated with`, no tool or model names in commit messages, the changeset, code comments, or the PR text.
- Commits are signed by the repository's git config. Do not change git config and do not pass `--no-gpg-sign`.
- Do NOT push or open a PR unless the operator who dispatched you told you to.

## Steps

### Step 1: Failing tests

In `__tests__/adapters/shared.test.ts`, next to the existing tests of each function:

1. `resolveEndpoint('x', 'ingest.example.com/v1?api_key=SECRETVALUE')` throws; the message does not contain `SECRETVALUE` and contains `ingest.example.com/v1?<redacted>`.
2. `resolveEndpoint('x', 'ingest.example.com/v1#token=SECRETVALUE')` throws; the message does not contain `SECRETVALUE`.
3. An unparseable URL with userinfo and a query (for example `'http://user:pw@exa mple.com/p?k=SECRETVALUE'`) throws a message with neither `pw` nor `SECRETVALUE`.
4. An unparseable URL with no query (`'not a url'`) keeps its message as today: `invalid endpoint URL 'not a url'`.
5. `flattenMeta(JSON.parse('{"a":1,"__proto__":"x","b":{"__proto__":"y"}}'))`: `Object.keys(result).sort()` is `['__proto__', 'a', 'b.__proto__']`, `Object.getOwnPropertyDescriptor(result, '__proto__')?.value` is `'x'`, `Object.getPrototypeOf(result)` is `Object.prototype`, and `JSON.stringify(result)` contains `"__proto__":"x"`.

**Verify**: `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test __tests__/adapters/shared.test.ts` → tests 1, 2, 3 and 5 fail; 4 passes.

### Step 2: Implement both changes

**Verify**: the same command → 0 fail. Then `env -u FORCE_COLOR -u NO_COLOR bun test __tests__/adapters` → 0 fail.

### Step 3: Changeset, lint, full suite

`.changeset/endpoint-error-query-and-proto-key.md`, `'logixlysia': patch`, two sentences: the error for an endpoint URL that does not parse no longer prints its query string or fragment; a logged field named `__proto__` is kept when an adapter flattens a record into attributes.

**Verify**: `bun run format && env -u FORCE_COLOR -u NO_COLOR bun run lint` → exit 0; `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` → exit 0; `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` → 0 fail.

## Test plan

The five tests in step 1.

## Done criteria

- [ ] The five new tests pass; `__tests__/adapters` → 0 fail
- [ ] Full package suite → 0 fail; lint and typecheck exit 0
- [ ] `.changeset/endpoint-error-query-and-proto-key.md` exists with `'logixlysia': patch`
- [ ] `git diff --stat origin/main` lists only the three in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts (the codebase drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- An existing test pins an error message that contains a query string.
- An adapter test fails because it relied on `flattenMeta` dropping `__proto__`.

## Maintenance notes

- Any new error message that prints a user-supplied URL must go through `withoutCredentials`.
- Deferred: `src/desertant.ts` assigns an Error's remaining own keys onto its clone with `clone[key] = …`; a `__proto__` own key there would change the clone's prototype. Needs its own check.
