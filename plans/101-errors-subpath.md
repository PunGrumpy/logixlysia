# Plan 101: `logixlysia/errors` ships `HttpError` and `isHttpErrorPayload` with no dependencies

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 91fd02f..HEAD -- packages/logixlysia/src/errors.ts packages/logixlysia/src/index.ts packages/logixlysia/package.json packages/logixlysia/bunup.config.ts packages/logixlysia/__tests__/api packages/logixlysia/__tests__/errors apps/docs/content/api-reference.mdx skills/logixlysia/SKILL.md` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `91fd02f`, 2026-11-08

## Why this matters

`HttpError` carries `code`, `why`, `fix` and `link` into the response body, but the only way to import it is the package root, whose built `dist/index.js` imports `elysia`, `pino`, `pino-pretty`, `chalk` and eight `node:` modules (measured). Shared code that throws `HttpError` on the server and reads `why`/`fix` on the client, a browser bundle, or an Eden consumer cannot import it. `src/errors.ts` imports nothing, and a measured `Bun.build` with it as an entry gives a 67 B `errors.js` that imports one 804 B chunk, which imports nothing; the root imports the same chunk, so there is one `HttpError` class on both paths. A guard `isHttpErrorPayload(value)` is the parse step at the client's `fetch` boundary, so a frontend can show `why` and `fix` without trusting the shape.

## Current state

- `packages/logixlysia/src/errors.ts` exports `HttpErrorPayload`, `HttpErrorInit` and `class HttpError`; it has no imports. `HttpErrorPayload`:

```ts
export interface HttpErrorPayload {
  code?: string
  fix?: string
  link?: string
  message: string
  status: number
  why?: string
}
```

- `packages/logixlysia/src/index.ts` lines 893-894: `export type { HttpErrorInit, HttpErrorPayload } from './errors'` and `export { HttpError } from './errors'`.
- `packages/logixlysia/package.json` `exports` has one entry per subpath (`./otel`, `./enrichers`, `./ai`, nine adapters, `./desertant`, `./http`, `./package.json`), each `{ types: './dist/<name>.d.ts', import: './dist/<name>.js', default: './dist/<name>.js' }`. `files` includes `dist`.
- `packages/logixlysia/bunup.config.ts` lists one entry per subpath (`src/index.ts` … `src/http.ts`); `external: ['elysia', 'chalk', 'pino', 'pino-pretty']`, `minify: true`, `sourcemap: 'inline'`, and `dist/shared/` chunks exist after a build.
- `packages/logixlysia/__tests__/api/surface.test.ts` snapshots the named exports of every `exports` subpath by importing `dist/*.js` in a child `bun` process (skipped when `dist/index.js` is missing), and asserts the bunup entries equal the exports subpaths. The snapshot file is `__tests__/api/__snapshots__/surface.test.ts.snap`; regenerate with `bun test --update-snapshots __tests__/api` after `bun run build`.
- `packages/logixlysia/__tests__/errors/http-error.test.ts` tests `HttpError` with a `richError()` helper (`new HttpError(402, 'Card declined', { code, fix, internal, link, why })`).
- `apps/docs/content/api-reference.mdx` "### `HttpError`" section (lines 331-398) shows the class, an example importing from `'logixlysia'`, and the response body.
- `skills/logixlysia/SKILL.md` line 8: "Keep this file in sync with `packages/logixlysia/package.json#exports`"; lines 249-263 describe `HttpError` with `import { HttpError } from 'logixlysia'`.
- Conventions: Ultracite lint, `bun:test`, comments only for a non-obvious why, changeset required.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install (fresh worktree) | `bun install --frozen-lockfile` | exit 0 |
| Lint + format check | `bun run lint` (repo root) | exit 0 |
| Format | `bun run format` (repo root) | exit 0 |
| Typecheck | `bun run typecheck` (repo root) | exit 0 |
| Build | `cd packages/logixlysia && bun run build` | `dist/` has 16 entries, `dist/errors.js` among them |
| Tests | `cd packages/logixlysia && bun test` | all pass |
| Snapshot | `cd packages/logixlysia && bun test --update-snapshots __tests__/api` | snapshot rewritten |

Run `git checkout -- AGENTS.md` before every commit and stage by path.

## Scope

**In scope**:

- `packages/logixlysia/src/errors.ts`
- `packages/logixlysia/src/index.ts` (one export line)
- `packages/logixlysia/package.json` (`exports` only)
- `packages/logixlysia/bunup.config.ts` (`entry` only)
- `packages/logixlysia/__tests__/api/__snapshots__/surface.test.ts.snap`
- `packages/logixlysia/__tests__/api/errors-subpath.test.ts` (create)
- `packages/logixlysia/__tests__/errors/http-error.test.ts`
- `apps/docs/content/api-reference.mdx`
- `skills/logixlysia/SKILL.md`
- `.changeset/errors-subpath.md` (create)

**Out of scope**:

- `HttpError`'s behavior, `toJSON`, `toResponse`.
- Docs navigation files (`apps/docs/content/meta.ts`, `docs.json`): no new page.
- `README.md`.

## Git workflow

- Branch from `91fd02f`: `improve/101-errors-subpath`.
- Commits: `feat(errors): add logixlysia/errors with HttpError and isHttpErrorPayload`, then `docs(api): import HttpError from logixlysia/errors on the client`.
- No push, no PR.

## Steps

### Step 1: The guard

In `packages/logixlysia/src/errors.ts`, after `HttpErrorPayload`, add:

```ts
const CLIENT_FIELDS = ['code', 'why', 'fix', 'link'] as const

const isOptionalString = (value: unknown): boolean =>
  value === undefined || typeof value === 'string'

/**
 * True for the body `HttpError.toResponse()` sends, after a JSON round trip:
 * `message` is a string, `status` a number, and `code`, `why`, `fix` and
 * `link` are strings when present. Use it where a client parses a response.
 */
export const isHttpErrorPayload = (
  value: unknown
): value is HttpErrorPayload => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.message === 'string' &&
    typeof record.status === 'number' &&
    CLIENT_FIELDS.every(field => isOptionalString(record[field]))
  )
}
```

In `src/index.ts` change line 894 to `export { HttpError, isHttpErrorPayload } from './errors'`.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: The subpath

- `package.json`: add, between `"./desertant"` and `"./http"` (keep the file's key order style):

```json
    "./errors": {
      "types": "./dist/errors.d.ts",
      "import": "./dist/errors.js",
      "default": "./dist/errors.js"
    },
```

- `bunup.config.ts`: add `'src/errors.ts'` to `entry` after `'src/http.ts'`.
- `cd packages/logixlysia && bun run build`, then `bun test --update-snapshots __tests__/api`. The snapshot gains `"./errors": ["HttpError", "isHttpErrorPayload"]` and `"isHttpErrorPayload"` under `"."`. Inspect `git diff __tests__/api/__snapshots__` and confirm nothing else changed.

**Verify**: `ls packages/logixlysia/dist/errors.js packages/logixlysia/dist/errors.d.ts` → both exist; `cd packages/logixlysia && bun test __tests__/api` → pass.

### Step 3: Tests

Create `packages/logixlysia/__tests__/api/errors-subpath.test.ts`, modelled on `surface.test.ts` (same `distReady` skip):

- Read `dist/errors.js`, drop the `//# sourceMappingURL` line, collect every specifier from `from "..."` and `import "..."` with a module-level regex, follow each relative specifier into its file (`dist/shared/*.js`) recursively, and assert every specifier collected starts with `.` (no bare package names, no `node:`).
- In a child `bun -e` process like `surface.test.ts` does, `import('./dist/errors.js')`, construct `new HttpError(402, 'Card declined', { code: 'X' })`, and print `JSON.stringify(err.toJSON())` and `isHttpErrorPayload(JSON.parse(JSON.stringify(err.toJSON())))`; assert the guard printed `true`.
- Assert the `HttpError` imported from `dist/errors.js` and from `dist/index.js` are the same class (`import` both in the child process and print `a.HttpError === b.HttpError`). If the bundler gives two classes, STOP: the plan assumed one shared chunk.

In `packages/logixlysia/__tests__/errors/http-error.test.ts`, import `isHttpErrorPayload` from `'../../src'` and add a `describe('isHttpErrorPayload')`:

- true for `JSON.parse(JSON.stringify(richError().toJSON()))` and for `{ message: 'x', status: 404 }`
- false for `null`, `'x'`, `42`, `{ message: 'x' }`, `{ status: 402 }`, `{ message: 'x', status: '402' }`, `{ message: 'x', status: 402, code: 7 }`, `{ message: 'x', status: 402, why: null }`
- narrowing: inside `if (isHttpErrorPayload(value))`, `value.why` typechecks as `string | undefined` (write it as a used variable so the typecheck proves it).

**Verify**: `cd packages/logixlysia && bun run build && bun test` → all pass.

### Step 4: Docs, skill, changeset

`apps/docs/content/api-reference.mdx`, in the `HttpError` section: after the class block and before "**Properties:**", add:

> Import it from `logixlysia` on the server, or from `logixlysia/errors` anywhere: that subpath has no dependencies, so shared code and browser bundles can throw `HttpError` and read its payload. The two imports are the same class.

After the "Response body" JSON block, add a subsection:

````md
#### `isHttpErrorPayload`

```ts check=skip
import { isHttpErrorPayload } from 'logixlysia/errors'

const response = await fetch('/pay', { method: 'POST' })
const body: unknown = await response.json()
if (isHttpErrorPayload(body)) {
  showToast(body.why ?? body.message, { action: body.fix, href: body.link })
}
```

True when `message` is a string, `status` a number, and each of `code`, `why`, `fix` and `link` is absent or a string.
````

`skills/logixlysia/SKILL.md`, in the `HttpError` section (around line 249): add one sentence: "`logixlysia/errors` exports `HttpError` and `isHttpErrorPayload` without pulling in Elysia or pino; use it in shared or client code."

Create `.changeset/errors-subpath.md`:

```md
---
'logixlysia': minor
---

`logixlysia/errors` exports `HttpError` and `isHttpErrorPayload` with no dependencies, so shared code and browser bundles can throw the error and parse its `why`, `fix` and `link` from a response. The root still exports both.
```

Run `bun run format` at the repo root.

**Verify**: `bun run lint && bun run typecheck` → exit 0.

## Test plan

- `__tests__/api/errors-subpath.test.ts`: dependency-free bundle, guard on a round-tripped payload, one class across both entries.
- `__tests__/errors/http-error.test.ts`: guard truth table and narrowing.
- `__tests__/api/surface.test.ts`: snapshot updated, entry/exports parity.
- `cd packages/logixlysia && bun run build && bun test` → all pass.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun run build && bun test` exits 0
- [ ] `ls packages/logixlysia/dist | grep -c "\.js$"` is 16 or more and includes `errors.js`
- [ ] `grep -n '"./errors"' packages/logixlysia/package.json` matches
- [ ] `grep -n "isHttpErrorPayload" packages/logixlysia/__tests__/api/__snapshots__/surface.test.ts.snap` matches twice
- [ ] `git status --short` lists only in-scope files
- [ ] `.changeset/errors-subpath.md` exists with `'logixlysia': minor`

## STOP conditions

- `dist/errors.js` or a chunk it imports contains a bare specifier (`elysia`, `pino`, `chalk`, `node:`).
- The two entries yield different `HttpError` classes.
- The snapshot diff shows changes beyond the two new lines.

## Maintenance notes

- A new field on `HttpErrorPayload` must be added to `CLIENT_FIELDS` if it is a string, or the guard will accept a wrong shape for it.
- Adding a subpath touches `bunup.config.ts`, `package.json`, the snapshot, the API reference and the skill file; `surface.test.ts` catches the first two drifting apart.
