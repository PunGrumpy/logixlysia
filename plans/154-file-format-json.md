# Plan 154: `fileFormat: 'json'` writes the log file as one JSON record per line

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat be8daf5..HEAD -- packages/logixlysia/src/output/file.ts packages/logixlysia/src/logger/emit.ts packages/logixlysia/src/config/resolve-options.ts packages/logixlysia/src/types/config.ts` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/153-service-on-every-record.md
- **Category**: direction
- **Planned at**: commit `be8daf5`, 2026-11-26

## Why this matters

The log file is a text line (`<ISO time> <LEVEL> <METHOD> <path> <status> <duration> <message> <context JSON>`). Log shippers that tail a file (Vector, Fluent Bit, Promtail, the CloudWatch agent) and coding agents that read logs want one JSON object per line, and today the only way to get that on disk is to redirect the console of a `consoleFormat: 'json'` app, which loses rotation and retention. The JSON line already exists for the console. This plan lets the file sink write the same line.

## Current state

All paths are under `packages/logixlysia/`.

- `src/output/file.ts` — `logToFile` builds the text line and hands it to the file sink:

```ts
const message = typeof data.message === 'string' ? data.message : ''
const { durationMs } = precomputed

const pathname = resolvePathname(config?.logQueryParams, precomputed)
const head = `${new Date().toISOString()} ${level} ${request.method} ${sanitizeLogText(pathname, 1024)} ${resolveStatus(data.status)} ${durationMs.toFixed(2)}ms`
const line = `${head}${message ? ` ${sanitizeLogText(message)}` : ''}${resolveContext(data.context)}\n`
```

- `src/logger/emit.ts` — `formatJsonLine(level, data, request, precomputed, options)` and the `LINE_OWNED_KEYS` set are private to this file. `writeRecord` calls `logToFile({ data: logData, filePath, level, options, precomputed, request: logRequest, store })` and then, for the console, `formatJsonLine(level, logData, logRequest, precomputed, options)` when `formatContext.consoleFormat === 'json'`. `logData` and `logRequest` are already redacted when `autoRedact` is on.
- `src/config/resolve-options.ts:126-136` — `validateFormatting` rejects a bad `consoleFormat`:

```ts
const validateFormatting = (config: Options['config']): void => {
  const consoleFormat: unknown = config?.consoleFormat
  if (
    consoleFormat !== undefined &&
    consoleFormat !== 'json' &&
    consoleFormat !== 'text'
  ) {
    invalidFormatting(
      `consoleFormat must be 'json' or 'text', got ${JSON.stringify(consoleFormat)}`
    )
  }
```

- `src/types/config.ts:214-223` — the `consoleFormat` option and its JSDoc, which ends "The file sink is not affected."
- Docs: `apps/docs/content/features/file-logging.mdx` (the file line format), `apps/docs/content/configuration.mdx` (`### \`consoleFormat\``section, and the file logging options),`apps/docs/content/api-reference.mdx`(an`Options`type block that lists`consoleFormat?: 'json' | 'text'`).
- Tests for the file line: `__tests__/output/file-line.test.ts` (the pattern to copy: temp dir from `_helpers/tmp.ts`, a plugin with `logFilePath`, requests through `app.handle`, then `flushLogixlysia`, then read the file).

## Design (decided)

- New option `config.fileFormat?: 'json' | 'text'`, default `'text'`. With `'json'`, each record is written as the JSON console line followed by `\n`: same keys, same order, same redaction, same `logQueryParams` rule.
- Move `formatJsonLine` and `LINE_OWNED_KEYS` out of `src/logger/emit.ts` into a new file `src/output/json-line.ts`, exported, unchanged. `emit.ts` and `file.ts` both import it. Do not duplicate it.
- `logToFile` picks the line by `config?.fileFormat === 'json'`.
- `validateFormatting` rejects any other value with `fileFormat must be 'json' or 'text', got …` through `invalidFormatting`.
- The presets (`dev`, `prod`, `json`) do not set `fileFormat`. Changing what an existing deployment writes to disk is not part of this plan.
- Rotation, retention, file mode and the sink are untouched.

## Scope

**In scope**:

- `packages/logixlysia/src/output/json-line.ts` (create)
- `packages/logixlysia/src/output/file.ts`
- `packages/logixlysia/src/logger/emit.ts`
- `packages/logixlysia/src/config/resolve-options.ts` (`validateFormatting` only)
- `packages/logixlysia/src/types/config.ts` (the new option and the last sentence of the `consoleFormat` JSDoc)
- `packages/logixlysia/__tests__/output/file-format-json.test.ts` (create)
- `packages/logixlysia/__tests__/config/resolve-options.test.ts` (one test for the validation)
- `apps/docs/content/features/file-logging.mdx`, `apps/docs/content/configuration.mdx`, `apps/docs/content/api-reference.mdx`
- `skills/logixlysia/SKILL.md` (one line where file logging options are listed, if such a list exists)
- `.changeset/file-format-json.md` (create)
- `packages/logixlysia/__tests__/api/` snapshot, only if `bun test __tests__/api` fails because the public surface changed (update with `bun test --update-snapshots __tests__/api`)

**Out of scope**:

- `src/output/file-sink.ts`, `src/output/rotation-manager.ts`.
- The presets in `resolve-options.ts`.
- `src/output/index.ts` (`toRecordMeta`).

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

- Branch: `feat/file-format-json`, cut from `origin/main`.
- Atomic commits, one logical unit each (for example: the fix with its tests, then the docs, then the changeset). Conventional commits with a body that says why. Example from `git log`: `feat(ai): record prompt-cache tokens (#657)`.
- **No attribution of any kind**: no `Co-Authored-By`, no `Generated with`, no tool or model names in commit messages, the changeset, code comments, or the PR text.
- Commits are signed by the repository's git config. Do not change git config and do not pass `--no-gpg-sign`.
- Do NOT push or open a PR unless the operator who dispatched you told you to.

## Steps

### Step 1: Failing tests

Create `__tests__/output/file-format-json.test.ts`, modelled on `__tests__/output/file-line.test.ts`. Config for each: `disableInternalLogger: true`, `logFilePath` in a fresh temp dir, `fileFormat: 'json'`. After the requests, `await flushLogixlysia(options, { close: true })` and read the file.

1. A `GET /ok` returning 200: the file has one line; `JSON.parse(line)` has `level: 'INFO'`, `message: ''`, `request: { method: 'GET', url: 'http://localhost/ok' }`, `status: 200`, a numeric `durationMs`, and a `timestamp` that `new Date(...)` parses; `Object.keys(parsed).slice(0, 2)` is `['timestamp', 'level']`.
2. A handler that calls `log.info('hello', { a: 1 })`: two lines; the first parses to `message: 'hello'` and holds `a: 1` where the JSON console line puts it (compare with `__tests__/plugin/json-console.test.ts`).
3. A message with a line break (`log.info('a\nb')`): still exactly two lines in the file, and the parsed `message` is `'a\nb'`.
4. A handler that throws `new Error('boom')`: the line parses to `level: 'ERROR'`, `status: 500`, `error.message: 'boom'`.
5. `autoRedact: true` with `log.info('x', { password: 'hunter2' })`: the file does not contain `hunter2`.
6. `service: 'my-api'`: the third key of the parsed line is `service` with that value.
7. Without `fileFormat`: the line starts with an ISO timestamp followed by `INFO GET /ok 200` (the text line is unchanged).

In `__tests__/config/resolve-options.test.ts`: `fileFormat: 'yaml'` throws an error whose message contains `fileFormat must be 'json' or 'text', got "yaml"`.

**Verify**: `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test __tests__/output/file-format-json.test.ts` → tests 1–6 fail, 7 passes.

### Step 2: Move the JSON line

Create `src/output/json-line.ts` with `formatJsonLine` and `LINE_OWNED_KEYS` moved verbatim (with their imports); import it in `emit.ts`.

**Verify**: `env -u FORCE_COLOR -u NO_COLOR bun test __tests__/plugin/json-console.test.ts __tests__/plugin/record-own-fields.test.ts` → 0 fail. `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` → exit 0.

### Step 3: The option, the branch, the validation

Add `fileFormat` to the config type next to `consoleFormat` with a JSDoc (what it writes, `@default 'text'`, "Rotation and retention work the same for both."). Change the last sentence of the `consoleFormat` JSDoc to "The file sink has its own switch, `fileFormat`." Branch in `logToFile`. Extend `validateFormatting`.

**Verify**: both test files from step 1 → all pass.

### Step 4: Docs and changeset

- `features/file-logging.mdx`: a section "JSON lines" with the option, a three-line example of a file, and one sentence each on: same record as the JSON console line, same redaction, rotation unchanged, presets do not turn it on.
- `configuration.mdx`: a `### \`fileFormat\``entry next to the file logging options (type, default, one paragraph); fix the`consoleFormat`sentence "The file sink is not affected." to point at`fileFormat`.
- `api-reference.mdx`: add `fileFormat?: 'json' | 'text'` to the `Options` block.
- `.changeset/file-format-json.md`, `'logixlysia': minor`.

**Verify**: `bun run format && env -u FORCE_COLOR -u NO_COLOR bun run lint` → exit 0.

### Step 5: Full suite

**Verify**: `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` → 0 fail. If only `__tests__/api` fails, read the snapshot diff, confirm the only change is the new option, and update the snapshot.

## Test plan

The seven file tests and one validation test in step 1.

## Done criteria

- [ ] `__tests__/output/file-format-json.test.ts` exists, 7 pass
- [ ] `rg -n "const formatJsonLine" packages/logixlysia/src` → exactly one match, in `src/output/json-line.ts`
- [ ] Full package suite → 0 fail; lint and typecheck exit 0
- [ ] `.changeset/file-format-json.md` exists with `'logixlysia': minor`
- [ ] `git diff --stat origin/main` lists only in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts (the codebase drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- `toRecordMeta` on `origin/main` does not yet set `service` (plan 153 has not merged): stop, this plan depends on it.
- Moving `formatJsonLine` creates an import cycle that breaks the build or a test.
- Any existing file-line test changes its output.

## Maintenance notes

- The JSON console line and the JSON file line are now one function. A change to one is a change to the other; `json-console.test.ts` and `file-format-json.test.ts` both pin it.
- Deferred on purpose: turning `fileFormat: 'json'` on in the `prod` and `json` presets. That changes what existing deployments write and belongs in a major.
