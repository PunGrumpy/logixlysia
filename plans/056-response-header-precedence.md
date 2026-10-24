# Plan 056: Give response-phase enrichers the headers the client actually got

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b2a8244..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/src/types/enricher.ts packages/logixlysia/__tests__/enrichers/plugin.test.ts` If anything is listed, compare each "before" excerpt below against the live code. On a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b2a8244`, 2026-10-23

## Why this matters

When a handler returns a `Response` and also sets the same header in `set.headers`, Elysia 1.4.30 sends the `Response`'s value: its `mergeHeaders` copies a `set.headers` key only when the `Response` lacks it. The plugin merges the other way round in `readableResponseHeaders`, so every response-phase enricher sees a value the client never got. Reproduced at `b2a8244`: a handler that sets `set.headers['content-length'] = '99'` and returns `new Response('body', { headers: { 'content-length': '4' } })` sends `content-length: 4`, while `sizeEnricher` logs `responseBytes: 99`. The existing test pins the wrong value, and its comment ("Elysia applies set.headers last") is false. After this plan the log agrees with the wire.

## Current state

- `packages/logixlysia/src/index.ts:274-292` builds the header view enrichers read. `set.headers` wins:

```ts
/**
 * The response headers an enricher gets to read. `set.headers` alone misses
 * anything a handler put on a returned `Response` (a `content-length`, say),
 * so the two are merged — with `set.headers` winning, since Elysia applies
 * it last. Only built when an enricher will actually read it.
 */
const readableResponseHeaders = (
  setHeaders: Record<string, string | number>,
  responseHeaders?: Headers
): Record<string, unknown> => {
  const merged: Record<string, unknown> = {}
  if (responseHeaders) {
    for (const [key, value] of responseHeaders) {
      merged[key] = value
    }
  }
  return Object.assign(merged, setHeaders)
}
```

- Elysia 1.4.30, `node_modules/elysia/dist/adapter/utils.mjs:227-240` (how the wire response is built). The `Response`'s header wins; `set.headers` fills gaps:

```js
function mergeHeaders(responseHeaders, setHeaders) {
  const headers = new Headers(responseHeaders);
  ...
  else
    for (const key in setHeaders)
      key === "set-cookie" ? headers.append(key, setHeaders[key]) : responseHeaders.has(key) || headers.set(key, setHeaders[key]);
  return headers;
}
```

- `packages/logixlysia/src/types/enricher.ts:8` documents the field wrongly:

```ts
/** Response headers set so far (Elysia's `set.headers`). */
```

- `packages/logixlysia/__tests__/enrichers/plugin.test.ts:212-234` pins the wrong behavior (`responseBytes: 99`) under the title `'set.headers wins over a header of the same name on the Response'`. Follow the pattern of the neighbouring test `'sizeEnricher receives headers from a Response object'` (same file, ~line 186): `createCaptureTransport()`, an app with `disableFileLogging` and `disableInternalLogger`, then `contextOf(events[0])`.
- `sizeEnricher` (`packages/logixlysia/src/enrichers.ts:368-394`) already looks headers up case-insensitively through `findHeader`, so only the precedence needs fixing.

### Repo facts

- Bun 1.3.14 workspaces with Turborepo. The published package is `packages/logixlysia`, an Elysia logging plugin. Other workspaces: `apps/docs` (the Blume docs site), `apps/elysia` (a playground app), `packages/bench` (vitest benchmarks), `packages/video` (a Remotion promo).
- Lint and format are Ultracite (oxlint and oxfmt). `bun run lint` runs both and fails on any finding. Rules that shape this plan:
  - `no-empty` is an error: a block needs a statement or a comment. Never delete the only comment inside a `catch {}` or a function body unless a step here says what replaces it.
  - `typescript/ban-ts-comment` is an error and requires a description after every `@ts-expect-error`. Do not touch those lines.
  - `typescript/consistent-type-definitions` is an error: object types stay `interface`.
  - `promise/prefer-await-to-then` is an error in `src/` and off under `__tests__/`.
  - `unicorn/no-useless-undefined`, `no-useless-return`, `no-use-before-define` and `func-style` are errors.
  - Never turn a rule off and never add an `oxlint-disable` comment. If lint rejects a change, restructure the code. If you cannot, STOP.
- `turbo` appends a block marked `<!-- BEGIN:turborepo-agent-rules -->` to `AGENTS.md` when it detects an AI agent. That change is not part of this plan: run `git checkout -- AGENTS.md` before every commit and never stage `AGENTS.md`.
- Every comment this plan deletes was read against the code at `b2a8244` and judged to restate it, narrate it, or carry history. The comments left in place were judged to carry a reason the code cannot show (a dependency or protocol quirk, a public API contract, a lint-required marker). Do not delete anything that is not listed, and do not keep anything that is.

## Commands you will need

| Purpose | Command (worktree root unless noted) | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | `705 pass`, `0 fail` once this plan is done (`703 pass` at `b2a8244`) |
| Build | `bun run build` | exit 0 |

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/index.ts`: ONLY `readableResponseHeaders` and its doc comment (lines 274-292). Plan 058 edits other parts of this file in parallel; touching anything else causes merge conflicts.
- `packages/logixlysia/src/types/enricher.ts`: ONLY the `headers` field doc (line 8).
- `packages/logixlysia/__tests__/enrichers/plugin.test.ts`: ONLY the test at lines 212-234, plus one new test right after it.
- `.changeset/response-headers-win.md` (create).

**Out of scope** (do NOT touch):

- Every other line of `src/index.ts` and `__tests__/enrichers/plugin.test.ts` (other plans edit them in parallel).
- `packages/logixlysia/src/enrichers.ts`: `sizeEnricher` is correct once it receives the right headers.
- `set-cookie` handling: Elysia appends `set.headers` cookies; this view keeps the `Response`'s. Enrichers do not read cookies; leave it (see Maintenance notes).

## Git workflow

- Branch: `improve/056-response-header-precedence`, created in Step 0 from `b2a8244`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(logger): log the status the client actually got`).
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git switch -c improve/056-response-header-precedence`. If that branch already exists, STOP.
2. `bun install --frozen-lockfile` → exit 0.
3. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
4. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`. If any fails before you changed anything, STOP.
5. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Replace the wrong test with two tests that pin the wire behavior

In `packages/logixlysia/__tests__/enrichers/plugin.test.ts`, replace the whole test `'set.headers wins over a header of the same name on the Response'` (lines 212-234, including its comment) with:

```ts
test('a header on the returned Response wins over set.headers, as on the wire', async () => {
  const { events, transport } = createCaptureTransport()
  const app = new Elysia()
    .use(
      logixlysia({
        config: {
          disableFileLogging: true,
          disableInternalLogger: true,
          enrichers: [sizeEnricher()],
          transports: [{ log: transport }]
        }
      })
    )
    .get('/precedence', ({ set }) => {
      set.headers['content-length'] = '99'
      return new Response('body', { headers: { 'content-length': '4' } })
    })

  const response = await app.handle(new Request('http://localhost/precedence'))

  expect(response.headers.get('content-length')).toBe('4')
  expect(contextOf(events[0])).toMatchObject({ responseBytes: 4 })
})

test('set.headers fills in a header the returned Response lacks', async () => {
  const { events, transport } = createCaptureTransport()
  const app = new Elysia()
    .use(
      logixlysia({
        config: {
          disableFileLogging: true,
          disableInternalLogger: true,
          enrichers: [
            { response: ({ headers }) => ({ source: headers['x-source'] }) }
          ],
          transports: [{ log: transport }]
        }
      })
    )
    .get('/fill', ({ set }) => {
      set.headers['x-source'] = 'set-headers'
      return new Response('body')
    })

  const response = await app.handle(new Request('http://localhost/fill'))

  expect(response.headers.get('x-source')).toBe('set-headers')
  expect(contextOf(events[0])).toMatchObject({ source: 'set-headers' })
})
```

**Verify**: `cd packages/logixlysia && bun test __tests__/enrichers/plugin.test.ts` → exactly one failure, in `a header on the returned Response wins over set.headers, as on the wire`, with `responseBytes` 99 received where 4 was expected. The new fill-in test passes. If the precedence test passes before Step 2, the premise is false: STOP.

### Step 2: Merge the headers the way Elysia does

Replace `readableResponseHeaders` and its doc comment in `packages/logixlysia/src/index.ts` with:

```ts
/**
 * The response headers an enricher gets to read, merged the way Elysia builds
 * the wire response: a header on a returned `Response` wins, and
 * `set.headers` fills in the ones it lacks. Only built when an enricher will
 * actually read it.
 */
const readableResponseHeaders = (
  setHeaders: Record<string, string | number>,
  responseHeaders?: Headers
): Record<string, unknown> => {
  const merged: Record<string, unknown> = {}
  if (responseHeaders) {
    for (const [key, value] of responseHeaders) {
      merged[key] = value
    }
  }
  for (const [key, value] of Object.entries(setHeaders)) {
    if (!responseHeaders?.has(key)) {
      merged[key] = value
    }
  }
  return merged
}
```

The comment stays because it records Elysia behavior the code cannot show. `Headers.has` is case-insensitive, matching Elysia.

**Verify**: `cd packages/logixlysia && bun test __tests__/enrichers` → all pass, including `the request id still reaches the response when a Response is returned`. `bun run lint` → exit 0.

### Step 3: Correct the field doc

In `packages/logixlysia/src/types/enricher.ts`, replace

```ts
/** Response headers set so far (Elysia's `set.headers`). */
```

with

```ts
/** The response headers the client gets: a returned `Response`'s own, then `set.headers` for any it lacks. */
```

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Add the changeset and commit

Create `.changeset/response-headers-win.md`:

```md
---
'logixlysia': patch
---

Response-phase enrichers now see the headers the client actually got. When a handler returns a `Response` and also sets the same header in `set.headers`, Elysia sends the `Response`'s value, but enrichers were handed the `set.headers` one, so `sizeEnricher` could log a `responseBytes` the client never saw. The `Response`'s header now wins, and `set.headers` still fills in any header the `Response` does not carry.
```

`bun run format` → exit 0, then `git checkout -- AGENTS.md`.

**Commit** (stage the four files by path): `fix(enrichers): give a returned Response's headers precedence, as on the wire`

### Step 5: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `705 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B b2a8244..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff b2a8244..HEAD | grep -c '^+.*oxlint-disable'` → `0`.

## Test plan

- Two tests in `__tests__/enrichers/plugin.test.ts`, modelled on `'sizeEnricher receives headers from a Response object'`:
  - precedence: same header in `set.headers` (99) and on the `Response` (4) → wire says 4 and `responseBytes` is 4;
  - fill-in: header only in `set.headers` → wire and enricher both see it.
- The precedence test must fail before Step 2 and pass after it. Net test count: 703 - 1 + 2 = 705.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `705 pass`, `0 fail`
- [ ] `git diff --name-only b2a8244..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)
- [ ] `grep -n "Object.assign(merged, setHeaders)" packages/logixlysia/src/index.ts` → no output
- [ ] `grep -n "set.headers wins" packages/logixlysia/__tests__/enrichers/plugin.test.ts` → no output
- [ ] `.changeset/response-headers-win.md` exists with `'logixlysia': patch`

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `b2a8244`).
- A verification fails twice after a reasonable fix attempt.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.
- The precedence test passes before Step 2 (Elysia no longer behaves as described).
- `the request id still reaches the response when a Response is returned` fails after Step 2.

## Maintenance notes

- If Elysia changes how it merges `set.headers` into a returned `Response` (check `mergeHeaders` / `applySetHeaders` when upgrading, including the Elysia 2 branch), this function must follow it. The precedence test will fail if the two drift apart.
- `set-cookie`: Elysia appends `set.headers` cookies to a `Response` that already has some; this view keeps only the `Response`'s. No enricher reads cookies today. If one ever does, mirror the append.
- Reviewers: check that only lines 274-292 of `src/index.ts` changed.
