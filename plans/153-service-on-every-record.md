# Plan 153: The configured `service` name is on the record every transport receives

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat be8daf5..HEAD -- packages/logixlysia/src/output/index.ts packages/logixlysia/src/logger/emit.ts packages/logixlysia/src/types/config.ts` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `be8daf5`, 2026-11-26

## Why this matters

`config.service` names the app. The text line shows it as `[my-api]` and the JSON console line carries a `service` key, but the record handed to transports has no service at all. Anyone shipping through `logixlysia/http`, a hand-written transport or `logixlysia/testing` cannot tell which service wrote a record, and the JSON console line is documented as "the record transports receive" while holding a key the transports never get. After this plan `meta.service` is set whenever `service` is configured.

## Current state

All paths are under `packages/logixlysia/`.

`src/output/index.ts:75-95`:

```ts
/** The record transports receive as `meta`, and the body of the JSON console line. */
export const toRecordMeta = ({
  data,
  options,
  precomputed,
  request
}: Omit<LogToTransportsInput, 'level' | 'store'>): Record<string, unknown> => {
  // The record's request wins over a `request` key in the data.
  const { request: _dataRequest, ...ownData } = data
  return {
    request: {
      method: request.method,
      url: options.config?.logQueryParams
        ? request.url
        : withoutQuery(request.url)
    },
    ...ownData,
    durationMs: precomputed.durationMs
  }
}
```

`src/logger/emit.ts` `formatJsonLine` (the JSON console line) computes the service itself and drops a data key of that name:

```ts
  const service = options.config?.service?.trim() || undefined
  const { message } = data
  const restEntries = Object.entries(rest).filter(
    ([key]) =>
      !(
        LINE_OWNED_KEYS.has(key) ||
        (service !== undefined && key === 'service')
      )
  )
  ...
      ['timestamp', new Date().toISOString()],
      ['level', level],
      ...(service === undefined ? [] : [['service', service]]),
      ['message', typeof message === 'string' ? message : ''],
```

`src/types/config.ts:230-231`:

```ts
  /** Service name shown in `{service}` token (e.g. evlog-style `[my-app]`). */
  service?: string
```

`apps/docs/content/configuration.mdx` section `### \`service\``says: "Service name used by the`{service}`placeholder (evlog-style`[my-app]`prefix)." and "The JSON console line carries it as the`service` key."

Adapters with their own service option are not affected: Datadog builds `{ ...entry.meta, ddsource, message, service, status, timestamp }` (`src/datadog.ts`, `toEvent`), so its own `service` option still wins; OTLP, HyperDX and Loki keep `serviceName` as the resource attribute or label and will carry `service` as one more attribute.

## Design (decided)

- In `toRecordMeta`: `const service = options.config?.service?.trim() || undefined`. When it is defined, the returned record has `service` set to it, placed after `request` and winning over a `service` key in the data (same rule the JSON line already applies, and the same as the `request` key). When it is not defined, nothing changes: a `service` key in the data passes through as before.
- `formatJsonLine` must print byte-for-byte what it prints today. It may read `service` from the record instead of recomputing it; keep the key order `timestamp, level, service, message, request, status, durationMs, context, error, …rest`.
- Do not add a field to `MemoryRecord`; `record.meta.service` is enough.
- Replace the two "evlog-style" mentions (the JSDoc in `src/types/config.ts` and the sentence in `configuration.mdx`): no other logging library may be named outside the two comparison pages.

## Scope

**In scope**:

- `packages/logixlysia/src/output/index.ts`
- `packages/logixlysia/src/logger/emit.ts`
- `packages/logixlysia/src/types/config.ts` (JSDoc of `service` only)
- `packages/logixlysia/__tests__/output/transports.test.ts` or a new `packages/logixlysia/__tests__/plugin/record-service.test.ts`
- `apps/docs/content/configuration.mdx` (the `service` section only)
- `apps/docs/content/features/transports.mdx` (one sentence where `meta` is described)
- `apps/docs/content/features/formatting.mdx` and `apps/docs/content/features/request-context.mdx` (one clause each: the two sentences that name another library)
- `skills/logixlysia/SKILL.md` (only if it describes what `meta` holds; one sentence)
- `.changeset/record-service.md` (create)

**Out of scope**:

- Any adapter file (`src/datadog.ts`, `src/otlp.ts`, `src/loki.ts`, …): do not make an adapter default its service name from `meta.service`.
- The file sink line (`src/output/file.ts`).
- `src/testing.ts`.

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

- Branch: `feat/record-service`, cut from `origin/main`.
- Atomic commits, one logical unit each (for example: the fix with its tests, then the docs, then the changeset). Conventional commits with a body that says why. Example from `git log`: `feat(otel): carry the active span's trace flags so OTLP records get flags (#642)`.
- **No attribution of any kind**: no `Co-Authored-By`, no `Generated with`, no tool or model names in commit messages, the changeset, code comments, or the PR text.
- Commits are signed by the repository's git config. Do not change git config and do not pass `--no-gpg-sign`.
- Do NOT push or open a PR unless the operator who dispatched you told you to.

## Steps

### Step 1: Failing tests

Create `__tests__/plugin/record-service.test.ts`. Use `createMemoryTransport` from `../../src/testing` (see `apps/docs/content/features/testing.mdx` and `__tests__/testing/` for usage) with `disableInternalLogger: true` and `disableFileLogging: true`, and drive the app with `app.handle(new Request('http://localhost/...'))`.

1. `service: 'my-api'` → the access line's `record.meta.service` is `'my-api'`, and so is a handler's `log.info` line.
2. No `service` → `'service' in record.meta` is `false`.
3. `service: '   '` → `'service' in record.meta` is `false`.
4. `service: 'my-api'` and a handler calling `log.info('x', { service: 'other' })`: find where that second argument lands in `record.meta` today (run it once without `service`), then assert that the top-level `meta.service` is `'my-api'`.
5. Datadog keeps its own name: `createDatadogTransport({ apiKey: 'k', service: 'dd-name', fetch: <capturing stub> })` (see `__tests__/adapters/` for the stub pattern each adapter test uses) with plugin `service: 'my-api'` → the posted event's `service` is `'dd-name'`.

**Verify**: `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test __tests__/plugin/record-service.test.ts` → tests 1 and 4 fail, the others pass.

### Step 2: Implement

Change `toRecordMeta` and, if you choose, simplify `formatJsonLine` to read the record's `service`.

**Verify**: the new file → all pass. `env -u FORCE_COLOR -u NO_COLOR bun test __tests__/plugin/json-console.test.ts __tests__/plugin/record-own-fields.test.ts __tests__/adapters` → 0 fail (the JSON line is unchanged).

### Step 3: Docs and changeset

- `src/types/config.ts`: `/** Service name. The text line shows it as \`[name]\` through the \`{service}\` token, and the JSON console line and every transport record carry it as \`service\`. */`
- `configuration.mdx`, `service` section: drop "evlog-style"; say "Service name. The `{service}` placeholder prints it as a `[my-app]` prefix."; replace the JSON sentence with "The JSON console line and the record a transport receives carry it as the `service` key, and it wins over a `service` key in the logged data. An adapter's own service option (`service` for Datadog, `serviceName` for OTLP, HyperDX and Loki) still names the service in that backend."
- `features/transports.mdx`: one sentence where the `meta` argument is described.
- `.changeset/record-service.md`, `'logixlysia': minor`.

**Verify**: `rg -n -i evlog packages/logixlysia/src apps/docs/content --glob '!**/comparison.mdx' --glob '!**/migration-from-evlog.mdx' --glob '!**/meta.ts' --glob '!**/docs.json'` → no matches. `bun run format && env -u FORCE_COLOR -u NO_COLOR bun run lint` → exit 0.

### Step 4: Full suite

**Verify**: `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` → 0 fail. `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` → exit 0.

## Test plan

The five tests in step 1. Existing JSON console tests are the guard that the console line did not change.

## Done criteria

- [ ] `__tests__/plugin/record-service.test.ts` exists, 5 tests pass
- [ ] Full package suite → 0 fail; lint and typecheck exit 0
- [ ] The `rg -i evlog` command in step 3 prints nothing
- [ ] `.changeset/record-service.md` exists with `'logixlysia': minor`
- [ ] `git diff --stat origin/main` lists only in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts (the codebase drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- An existing test asserts an exact `meta` object for a config that sets `service` and it now fails: report which test before changing its expectation.
- The JSON console line changes in any way.

## Maintenance notes

- Plan 154 (`fileFormat: 'json'`) reuses `formatJsonLine` and lands after this plan.
- If an adapter should one day default its service name from the plugin's `service`, it must read it from `entry.meta.service` and keep its own option as the override.
