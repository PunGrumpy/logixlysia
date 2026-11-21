# Plan 150: The README lists a memory record's real keys and says what Elysia 2 does to the types

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. Skip any instruction to update `plans/README.md`:
> the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/README.md README.md apps/docs/content/usage.mdx packages/logixlysia/src/testing.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition. `usage.mdx` and `src/testing.ts` are
> not edited by this plan; they are in the drift check because the README text
> repeats what they say.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

The README is the page npm shows for the package. Two of its statements do not match what the package does.

1. The "Testing" example says `memory.last() // { level, message, method, path, status, durationMs, requestId, context, error }`, nine keys. Running that exact example at `c019a4f` on Bun 1.3.14 gives a record with eleven keys:

   ```
   context, durationMs, error, level, message, meta, method, path, requestId, status, timestamp
   ```

   `meta` (everything the transport received) and `timestamp` (when it was received) are missing from the comment, although `MemoryRecord` documents both. A reader who wants the raw payload or the time does not learn from the README that they exist.

2. The README says the plugin works with the Elysia 2 prereleases, and at run time it does. But on Elysia 2 the handler's context type has no `log`, so the README's own first example does not compile. With the packed package and `elysia@2.0.0-rc.3`, `tsc --strict` on that example prints:

   ```
   readme0.ts(6,25): error TS2339: Property 'log' does not exist on type '{ body: unknown; query: Record<string, string | undefined>; params: { id: string; }; headers: Record<string, string | undefined>; cookie: Record<string, Cookie<unknown>>; ... 10 more ...; store: {}; }'.
   ```

   The same file compiles with no error against Elysia 1.4.30. The docs page `usage.mdx` already says this, but the README only links to that page under the words "what changes on Elysia 2". A user who copies the example onto Elysia 2 meets a type error the README never mentions.

After this plan the comment lists the eleven keys, and the Elysia 2 sentence says, in the README itself, that the types still describe Elysia 1.4, so `log` is missing from a handler's context type while it works at run time. No code changes.

## Current state

There is one README file. `README.md` at the repository root is a symbolic link to `packages/logixlysia/README.md` (`ls -la README.md` shows `README.md -> packages/logixlysia/README.md`). `packages/logixlysia/package.json` lists `"README.md"` in `files`, so `packages/logixlysia/README.md` is the file npm publishes and shows. Edit only `packages/logixlysia/README.md`; the link follows it. Do not replace the link with a copy.

`packages/logixlysia/README.md:13`, the Elysia 2 statement (one line):

```md
Works with Elysia 1.4 and the Elysia 2 prereleases. To try Elysia 2, install it from its `rc` tag (`bun add elysia@rc`); [what changes on Elysia 2](https://logixlysia.vercel.app/docs/usage#elysia-2-beta).
```

`packages/logixlysia/README.md:106-110`, the end of the "Testing" example:

````md
await app.handle(new Request('http://localhost/orders/42'))

memory.last() // { level, message, method, path, status, durationMs, requestId, context, error }
await memory.waitFor(record => record.message === 'order loaded')
```
````

`apps/docs/content/usage.mdx:12-24`, the section the README links to (anchor `#elysia-2-beta`). The README sentence must say no more than this page says. The lines it echoes:

```md
### Elysia 2 beta

Logixlysia runs on Elysia 1.4 and on the Elysia 2 prereleases, from `2.0.0-beta.32` on. To try it on Elysia 2, install Elysia from its `rc` tag:
...
- The plugin's TypeScript types still describe Elysia 1.4, so `log` and `store` are not yet part of a handler's context type on Elysia 2. They are there at runtime.
```

What was observed at `c019a4f` (Bun 1.3.14, `elysia@2.0.0-rc.3`, the 6.14.0 package with the `dist/` built from this commit):

- `log.mergeContext(...)` in a handler runs, and the request's record carries `{"userId":"42"}`.
- `store.pino.info` is a function at run time.
- In the handler's context type, `log` is absent and `store` is `{}` (the TS2339 message above).

The record's keys come from `MemoryRecord` in `packages/logixlysia/src/testing.ts` (also in the built `dist/testing.d.ts`): `context`, `durationMs`, `error`, `level`, `message`, `meta`, `method`, `path`, `requestId`, `status`, `timestamp`.

No check typechecks the README's code fences. `apps/docs/scripts/typecheck-snippets.ts` (run by `cd apps/docs && bun run typecheck`) scans only `apps/docs/content/**/*.mdx` (`new Glob('**/*.mdx').scanSync(CONTENT_DIR)`, line 360). This plan changes a comment and prose only, so no fence's code changes.

Changeset precedent: README changes have carried a `patch` changeset for `logixlysia`, because the README only reaches npm with a release. Examples: `.changeset/readme-quick-start-log.md` in commit `b10b6a3` (a docs-only commit) and `.changeset/readme-features.md` in commit `110df6b`, and `plans/README.md` line 536 records "patch for ... 029's README change". There is no commit that changed the README and nothing else.

## Commands you will need

Run lint and format from the worktree root.

| Purpose    | Command                                       | Expected on success            |
| ---------- | --------------------------------------------- | ------------------------------ |
| Install    | `bun install --frozen-lockfile` (root)        | exit 0                         |
| Lint       | `bun run lint` (root)                         | exit 0                         |
| Format     | `bun run format` (root)                       | exit 0; read the diff it makes |
| Typecheck  | `cd packages/logixlysia && bun run typecheck` | exit 0                         |

No test, build or docs typecheck is needed: no source file and no docs page changes. Do not run the full test suite for this plan.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/README.md` (line 13 and line 108 only)
- `.changeset/readme-memory-keys-and-elysia-2-types.md` (create)

**Out of scope** (do NOT touch):

- `README.md` at the root. It is a symbolic link to the package README. Do not replace it with a file.
- `apps/docs/content/usage.mdx`, `apps/docs/content/faq.mdx` and every other docs page. They already say this, and `faq.mdx` belongs to another pull request.
- Anything under `packages/logixlysia/src/`. Making the plugin's types work on Elysia 2 is a separate, larger change; this plan only says what is true today.
- Any other line of the README.

## Git workflow

- Branch: `fix/readme-memory-keys-and-elysia-2-types`, cut from the base commit your task names.
- Two commits, in this order:
  1. `docs(readme): list every memory record key and say log is untyped on Elysia 2` (the README)
  2. `chore(changeset): note the README corrections` (the changeset)
- Each commit body is one or two short paragraphs of plain prose: what the README said, what is true, how it was checked.
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Confirm the README is one file behind a link

From the worktree root:

```
ls -la README.md
cmp README.md packages/logixlysia/README.md && echo same
```

**Verify**: the first line shows `README.md -> packages/logixlysia/README.md` and the second prints `same`. If `README.md` is a regular file, STOP: the plan assumes one file.

### Step 2: Fix the record comment

In `packages/logixlysia/README.md`, replace line 108:

```ts
memory.last() // { level, message, method, path, status, durationMs, requestId, context, error }
```

with:

```ts
memory.last() // { level, message, method, path, status, durationMs, requestId, context, error, meta, timestamp }
```

The first nine keys stay in their order; `meta` and `timestamp` are appended.

**Verify**: `grep -c 'requestId, context, error, meta, timestamp }' packages/logixlysia/README.md` prints `1`.

### Step 3: Say what Elysia 2 does to the types

In `packages/logixlysia/README.md`, replace line 13 with exactly this one line:

```md
Works with Elysia 1.4 and the Elysia 2 prereleases. To try Elysia 2, install it from its `rc` tag (`bun add elysia@rc`). On Elysia 2 the plugin's types still describe Elysia 1.4: `log` and `store` work at run time but are not part of a handler's context type, so TypeScript reports `Property 'log' does not exist` on the example below. See [what changes on Elysia 2](https://logixlysia.vercel.app/docs/usage#elysia-2-beta).
```

Do not promise a fix, a date or a version. Keep the link URL as it is.

**Verify**: `grep -c "Property 'log' does not exist" packages/logixlysia/README.md` prints `1`, and `grep -c 'usage#elysia-2-beta' packages/logixlysia/README.md` prints `1`.

### Step 4: Lint and commit the README

From the root run `bun run format`, read its diff (it may re-wrap Markdown; it must not change any file other than the README), then `bun run lint`.

**Verify**: `bun run lint` exits 0. `git status --porcelain` lists only `packages/logixlysia/README.md` (run `git checkout AGENTS.md` first if a tool modified it). Make commit 1.

### Step 5: Changeset

Create `.changeset/readme-memory-keys-and-elysia-2-types.md`:

```md
---
'logixlysia': patch
---

<one short paragraph for a user of the package>
```

The paragraph says: the README's testing example now lists every key of a memory record, including `meta` and `timestamp`, and the README says that on Elysia 2 `log` and `store` work at run time but are not yet in a handler's context type. No code changed. Write it in your own plain words.

**Verify**: `bun run lint` exits 0, `cd packages/logixlysia && bun run typecheck` exits 0. Make commit 2. `git status --porcelain` is empty afterwards.

## Test plan

No test. The README is not typechecked or tested by the repository. The claims were checked against runs at `c019a4f`:

- The record keys: the README's testing example, run as written with Bun 1.3.14 against `packages/logixlysia/src`, gave the eleven keys listed in "Why this matters", for both the `log.info` record and the access record.
- The Elysia 2 sentence: the README's first example, compiled with `tsc --strict` against `elysia@2.0.0-rc.3`, gave the TS2339 error quoted above; the same file against Elysia 1.4.30 compiled with no error; and at run time on `2.0.0-rc.3`, `log.mergeContext` and `store.pino` both worked.

If you want to re-check the key list, run this from `packages/logixlysia` (it writes nothing):

```
bun -e "import { Elysia } from 'elysia'; import logixlysia from './src/index.ts'; import { createMemoryTransport } from './src/testing.ts'; const memory = createMemoryTransport(); const app = new Elysia().use(logixlysia({ config: { transports: [memory], useTransportsOnly: true } })).get('/orders/:id', ({ log, params }) => { log.info('order loaded', { orderId: params.id }); return { id: params.id } }); await app.handle(new Request('http://localhost/orders/42')); console.log(Object.keys(memory.last()).join(', '))"
```

Expected: `context, durationMs, error, level, message, meta, method, path, requestId, status, timestamp`. If it prints a different list, STOP.

## Done criteria

ALL must hold:

- [ ] `git diff --stat <base>..HEAD` lists exactly `packages/logixlysia/README.md` and `.changeset/readme-memory-keys-and-elysia-2-types.md`
- [ ] `git diff <base>..HEAD -- packages/logixlysia/README.md` changes exactly two lines (13 and 108)
- [ ] `ls -la README.md` still shows the symbolic link
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0
- [ ] No README code fence is typechecked by the repository (`apps/docs/scripts/typecheck-snippets.ts` reads only `apps/docs/content`), so there is no fence check to run; the Step 2 edit is inside a comment

## STOP conditions

Stop and report (do not improvise) if:

- `README.md` at the root is a regular file, not a link (Step 1).
- Line 13 or line 108 of the package README differs from the excerpt in "Current state".
- The key list check in "Test plan" prints a list other than the eleven keys.
- `apps/docs/content/usage.mdx` no longer has the `### Elysia 2 beta` heading, or no longer says the types still describe Elysia 1.4. The README sentence would then contradict the page it links to.
- `bun run format` changes a file other than the README.

## Maintenance notes

- When the plugin's types are made to work on Elysia 2, remove the type sentence from README line 13 and the matching bullet in `usage.mdx` together.
- When a field is added to `MemoryRecord` in `src/testing.ts`, add it to the README comment in the same change.
- Left out: `plans/README.md` records as deferred that the Elysia 2 half of the peer range is never typechecked in CI (`validate.yml`). This plan does not change that; it only tells users what they will see.
- Left out: README fences are not typechecked at all, unlike the docs pages. Adding the README to `typecheck-snippets.ts` would have caught neither fault here (the key list is a comment, and the check runs on Elysia 1.4), so it is not proposed.
