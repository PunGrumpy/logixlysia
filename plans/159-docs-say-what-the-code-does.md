# Plan 159: The API reference lists `redactPatterns`, the startup page says when no message prints, the comparison page is current, and the security model lists the controls the code enforces

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat be8daf5..HEAD -- apps/docs/content/api-reference.mdx apps/docs/content/features/startup.mdx apps/docs/content/comparison.mdx SECURITY_MODEL.md` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/154-file-format-json.md (both edit `api-reference.mdx`)
- **Category**: docs
- **Planned at**: commit `be8daf5`, 2026-11-26

## Why this matters

Four pages state things the code or the compared project contradicts. A reader configuring from the API reference never learns `redactPatterns` exists. The startup page promises a message in a case where the code prints nothing. The comparison page undersells and misdescribes the library it compares against, which is the one page where being wrong about someone else's project costs credibility. And `SECURITY_MODEL.md` lists one control, so every security review re-reports as gaps the things the code already does.

## Current state

1. `apps/docs/content/api-reference.mdx`, the `Options` type block (around line 112):

```ts
    autoRedact?: boolean
    redactKeys?: string[]
    logErrorPayload?: boolean
```

`packages/logixlysia/src/types/config.ts` has `redactPatterns?: RegExp[]` (search for `redactPatterns`), documented in `apps/docs/content/configuration.mdx`.

2. `apps/docs/content/features/startup.mdx:46`:

> The URL comes from the server Elysia hands to its start hooks. An adapter that does not hand one over, such as `@elysiajs/node`, gets the message without a URL: `🦊 Elysia is running` in the simple format, and the banner without its URL row.

`packages/logixlysia/src/extensions/index.ts`:

```ts
let url: string | null = null
if (server) {
  const { port, hostname, protocol } = server
  if (port === undefined || !hostname || !protocol) {
    return
  }
  url = `${protocol}://${hostname}:${port}`
}
```

So: no server object → the message without a URL; a server object that lacks a port, hostname or protocol → no message at all (pinned by `packages/logixlysia/__tests__/extensions/start-server.test.ts`, "does nothing when server info is incomplete"). Which of the two `@elysiajs/node` produces has not been observed.

3. `apps/docs/content/comparison.mdx` (this page and `migration-from-evlog.mdx` are the only places the other library may be named). Rows and bullets to check against the other project's own README at `https://raw.githubusercontent.com/evloghq/evlog/main/packages/evlog/README.md`:

| Line in the page | What the README says (read at 2026-11-26) |
| --- | --- |
| Row "Single access log per request": `log.emit()` | Its framework integrations emit one event per request automatically ("`log.emit()` called automatically at request end"); `log.emit()` is the manual form for scripts and workers. |
| Row "Built-in destinations": `Managed drains` | It ships drain adapters as subpaths (the README's "Adapters" table), including a file-system NDJSON adapter and a browser-to-server HTTP one. |
| Row "File rotation": `Via drains` | Check the README's file-system adapter entry and say what it documents; do not claim rotation unless its docs do. |
| Bullet "You want evlog's CLI and observability scoring built in." | The CLI is a separate package, `@evlog/cli`, that the `evlog` executable runs or fetches. |
| Bullet "You rely heavily on **`evlog/ai`** and **`evlog` auth** integrations out of the box." | The README documents `evlog/ai`. Search it for an auth integration; keep the claim only if you find one, and name it as the README does. |
| Bullet "You want evlog's error catalog and client/browser logging." | Client logging and audit logs are linked from the README; keep, and add audit logs if the README lists them. |

On the Logixlysia side of the table, after plans 153 and 154: the "File rotation" row can say the file can be text or JSON lines, only if plan 154 has merged (check `rg -n fileFormat packages/logixlysia/src/types/config.ts`).

4. `SECURITY_MODEL.md`, section "## Existing controls":

```md
- `autoRedact` masks sensitive keys.
- Disclosure through private advisories (`SECURITY.md`).
```

Controls the code enforces, each to be confirmed with the command given before you list it:

| Control | Confirm with |
| --- | --- |
| `redactPatterns`: value patterns masked in any string, built-in patterns for card numbers and tokens | `rg -n "redactPatterns" packages/logixlysia/src/types/config.ts packages/logixlysia/src/utils/redact.ts` |
| A failed validation's payload is logged only with `logErrorPayload: true` | `rg -n "logErrorPayload" packages/logixlysia/src/types/config.ts` |
| Query strings are stripped from the URL sent to transports and files unless `logQueryParams` is on | `rg -n "logQueryParams" packages/logixlysia/src/output/index.ts packages/logixlysia/src/output/file.ts` |
| Adapter endpoints must be `http:` or `https:` and requests do not follow redirects | `rg -n "endpoint must use http or https | redirect" packages/logixlysia/src/adapters/shared.ts` |
| Control characters, line breaks and ANSI escapes in request-controlled text are escaped or removed before a text sink prints them | `sed -n 1,37p packages/logixlysia/src/utils/sanitize.ts` |
| An inbound request id is used only when it matches `^[A-Za-z0-9._-]{1,128}$` | `rg -n "VALID_REQUEST_ID" packages/logixlysia/src/middleware/request-id.ts` |
| Log files are created with mode `0o600` unless `logFileMode` says otherwise | `rg -n "0o600" packages/logixlysia/src/output` |
| Path globs are bounded (wildcards per segment, repeated `**`, pathname length) so a request path cannot make matching slow | `sed -n 1,60p packages/logixlysia/src/sampling/glob.ts` |
| Context depth and error-cause depth are capped | `rg -n "MAX_DEPTH | maxDepth | contextDepth | MAX_CAUSE" packages/logixlysia/src/utils packages/logixlysia/src/logger | head -20` |

5. Elysia 2 release candidates and Bun (found on 2026-11-26, plan 160). From `2.0.0-rc.5` Elysia passes `set.headers` to Bun's `server.upgrade`; with no hook writing a header that is an empty object, and Bun before 1.4.4 throws on it (`upgrade options.headers must be a Headers or an object`), so every WebSocket route answers 500. Measured: a plain `new Elysia().use(websocket()).ws(...)` app with none of this package's code connects on `2.0.0-rc.4` and `2.0.0-beta.32` under Bun 1.3.14, fails on `2.0.0-rc.5` and `2.0.0-rc.6` under Bun 1.3.14, and connects on all four under Bun 1.4.5. `apps/docs/content/features/websocket.mdx` does not say this. Find the place in that page (and in `packages/logixlysia/README.md`, if it has an Elysia 2 section; `rg -n "Elysia 2" packages/logixlysia/README.md apps/docs/content`) where Elysia 2 setup for WebSocket routes is described.

## Scope

**In scope**:

- `apps/docs/content/api-reference.mdx` (the `Options` block)
- `apps/docs/content/features/startup.mdx` (the one paragraph)
- `apps/docs/content/comparison.mdx`
- `SECURITY_MODEL.md` (the "Existing controls" section only)
- `apps/docs/content/features/websocket.mdx` and `packages/logixlysia/README.md` (one note each, step 4b; the README edit needs no changeset only if the repository's changeset check accepts it — if `bunx changeset status` complains, add `.changeset/elysia-rc-bun-note.md` with `'logixlysia': patch`)

**Out of scope**:

- Anything under `packages/logixlysia/` (so no changeset is needed).
- `apps/docs/content/migration-from-evlog.mdx` (checked in the audit; accurate).
- Every other section of `SECURITY_MODEL.md`.
- Naming the other library anywhere but `comparison.mdx`.

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
| Docs build (optional, slow) | `cd apps/docs && bun run build` | exit 0 |

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

- Branch: `docs/reference-startup-comparison-security-model`, cut from `origin/main`.
- Atomic commits, one logical unit each (for example: the fix with its tests, then the docs, then the changeset). Conventional commits with a body that says why. Example from `git log`: `docs: correct statements the code and the vendors contradict (#652)`.
- **No attribution of any kind**: no `Co-Authored-By`, no `Generated with`, no tool or model names in commit messages, the changeset, code comments, or the PR text.
- Commits are signed by the repository's git config. Do not change git config and do not pass `--no-gpg-sign`.
- Do NOT push or open a PR unless the operator who dispatched you told you to.

## Steps

### Step 1: API reference

Compare the option names in the `Options` block of `api-reference.mdx` with the keys of the config interface in `packages/logixlysia/src/types/config.ts`. Add `redactPatterns?: RegExp[]` after `redactKeys`. If other options are missing from the block, add each with its exact type from `config.ts`; if the block lists an option that no longer exists, remove it. List what you added or removed in your report.

**Verify**: `rg -n "redactPatterns" apps/docs/content/api-reference.mdx` → one match inside the type block.

### Step 2: Startup page

Find out what `@elysiajs/node` hands the start hook: in `packages/logixlysia`, write a throwaway script outside the repo tree (for example `/tmp/startup-probe.ts` importing from the absolute path of `packages/logixlysia/src`) that builds `new Elysia({ adapter: node() }).use(logixlysia({ config: { startupMessageFormat: 'simple' } })).listen(0)`, run it with `node` or `bun`, and note what is printed. Delete the script. Rewrite the paragraph so it states the two cases the code has (no server object → the message without a URL; a server object without a port, hostname or protocol → no startup message) and names `@elysiajs/node` only in the case you observed. If you cannot run the probe, write the two cases without naming an adapter.

**Verify**: the paragraph no longer says an adapter "gets the message without a URL" unless your probe printed exactly that. Put the probe's output in your report.

### Step 3: Comparison page

Fetch the README URL above. For each row in the table under "Current state" item 3, change the cell or bullet only where the README contradicts it, using the README's own words for names. Keep the tone factual; do not add praise or criticism. Do not remove the "When to consider" section. Update the Logixlysia "File rotation" cell only if `fileFormat` exists in `config.ts`.

**Verify**: for every changed cell, your report quotes the README line that supports it.

### Step 4: Security model

Run each "Confirm with" command. For each control the command confirms, add one bullet to "## Existing controls" in the style of the existing two (one sentence, option names in backticks). Leave out any control you could not confirm, and say so in your report.

**Verify**: `sed -n '/## Existing controls/,/## Out of scope/p' SECURITY_MODEL.md` shows the two original bullets plus the confirmed ones.

### Step 4b: Elysia 2 release candidates need Bun 1.4.4 for WebSocket routes

Where `features/websocket.mdx` describes Elysia 2 (the `websocket()` capability from `elysia/websocket`), add a short note: "On Elysia `2.0.0-rc.5` and later, a WebSocket route needs Bun 1.4.4 or newer. On an older Bun the upgrade request answers 500 and the socket never opens, with or without Logixlysia." If the page has no Elysia 2 passage, add the note under the page's setup section with one sentence of context. Add the same note to the README's Elysia 2 passage if one exists. Do not describe the workaround of setting a header in a hook.

**Verify**: `rg -n "1\.4\.4" apps/docs/content/features/websocket.mdx` → one match.

### Step 5: Lint

**Verify**: `bun run format && env -u FORCE_COLOR -u NO_COLOR bun run lint` → exit 0. `git diff --stat origin/main` lists only in-scope files.

## Test plan

Docs only. The proof is the evidence quoted in the report: the probe output for step 2, a README quote per changed comparison cell, and the command output per security control.

## Done criteria

- [ ] `rg -n "redactPatterns" apps/docs/content/api-reference.mdx` → a match
- [ ] The startup paragraph matches `packages/logixlysia/src/extensions/index.ts`
- [ ] Every changed comparison cell has a README quote in the report
- [ ] `SECURITY_MODEL.md` lists only controls confirmed by a command
- [ ] `env -u FORCE_COLOR -u NO_COLOR bun run lint` exits 0
- [ ] `git diff --stat origin/main` lists only in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts (the codebase drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- The README URL cannot be fetched: do steps 1, 2 and 4 and report step 3 as not done.
- A "Confirm with" command shows the control does not exist as described: leave it out and report it; do not reword it into something weaker that you have not verified.

## Maintenance notes

- `SECURITY_MODEL.md`'s control list goes stale silently. When a control is added or removed in `packages/logixlysia/src`, update the list in the same PR.
- The comparison page describes another project at a point in time; re-read its README before each release that touches the page.
