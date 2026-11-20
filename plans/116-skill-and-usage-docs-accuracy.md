# Plan 116: The agent skill and the usage page say what the code does

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1e4f7cc..HEAD -- skills/logixlysia/SKILL.md apps/docs/content/usage.mdx apps/docs/content/adapters/overview.mdx` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live files before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `1e4f7cc`, 2026-11-20
- **Executed**: [PR #643](https://github.com/PunGrumpy/logixlysia/pull/643), merged as `e561b68`. Review corrected several sentences this plan specifies; see the review record in [README.md](README.md). The merged files are the reference, not the text below.

## Why this matters

Three pages state things the code no longer does, and one of them is the page coding agents are told to read.

- `skills/logixlysia/SKILL.md` is linked from the README as the API reference for coding agents. It still says a handler's `log.info` line **replaces** the request's access line, so the status and duration are lost. That stopped being true in 6.14.0: the access line is always written. An agent that reads the skill will avoid `log.*` in handlers or duplicate fields to work around a loss that does not happen. The file's own first instruction is "Keep this file in sync with `packages/logixlysia/package.json#exports`", yet it never mentions `logixlysia/http`, and it has nothing on `runJob`, `logFilter` paths, `redactPatterns`, `sampling.tail.keep`, a transport's `minLevel`, or `log.error(err)`, all public and all documented on the docs site.
- `apps/docs/content/usage.mdx` says of a thrown error: "It does not log stack traces." The console does not print one, but every transport and the JSON console line receive the full `stack` of a server error. An operator reading that sentence concludes no stack leaves the process.
- `apps/docs/content/adapters/overview.mdx` says an `Error` is copied "(not its stack)" in the paragraph that describes what reaches the wire, which reads as the same false promise.

After this plan the three files match the code at `1e4f7cc`. Nothing under `packages/logixlysia/` changes, so there is no changeset.

## Current state

Every fact below was checked against the source at `1e4f7cc`. Use the text given in the steps as written; do not re-derive behaviour from the code.

- `skills/logixlysia/SKILL.md` — 344 lines, thirteen numbered sections (`## 1. Installation and Basic Setup` … `## 13. Tracing and AI usage`), separated by `---` lines. The parts this plan touches:

  Line 58 (end of section 2):

  > A custom log that passes `logFilter` (`log.info`, `store.logger.info(request, …)`, `useLogger().info`) replaces that request's access line, so the request's status, its `durationMs` and the response-phase enricher fields are not logged on a separate line.

  Lines 90-91 (inside the config example of section 3):

  ```typescript
        // Auto-redaction of PII (emails, JWTs, card numbers)
        autoRedact: true,
  ```

  Line 179 (end of section 7):

  > The available destinations: `logixlysia/axiom`, `logixlysia/better-stack`, `logixlysia/clickhouse`, `logixlysia/datadog`, `logixlysia/hyperdx`, `logixlysia/loki`, `logixlysia/otlp`, `logixlysia/posthog`, `logixlysia/sentry`.

  Lines 185-203 (section 8, Sampling):

  ````markdown
  `config.sampling.head` keeps a percentage of records per level as they're emitted; levels left out keep everything. `config.sampling.tail` rescues head-dropped records for a request once its outcome is known, by status, duration, or path glob.

  ```typescript
  logixlysia({
    config: {
      sampling: {
        head: { DEBUG: 1, INFO: 10 },
        tail: {
          status: 400,
          durationMs: 1000,
          paths: ['/checkout/**']
        },
        maxBufferedPerRequest: 100 // default
      }
    }
  })
  ```

  Sampling is off unless at least one head rate is below `100`.
  ````

  Line 330 (section 13):

  > `logixlysia/ai` merges LLM usage under `ai` in the request context, so it appears on the access log, or on the custom log line that replaces the access line:

  The file ends at line 344 with the closing fence of the `mergeAIMetrics` example.

- `apps/docs/content/usage.mdx:241` (under `## Error Handling`):

  > Logixlysia logs the error automatically with the request method, path, status, and error message. For an `HttpError`, it also logs `code`, `why`, `fix`, and `link`. It does not log stack traces.

- `apps/docs/content/adapters/overview.mdx:60` — one long list item that starts with `- **Copied at log time** —`. The clause to change, inside it:

  > an `Error` keeps its `name`, `message`, `cause` and own fields (not its stack),

- What the code does, for reference (do NOT edit any of these files):
  - `packages/logixlysia/src/index.ts:641-648` — when a response is produced the plugin writes either the error line or the access line; no branch skips the access line because a handler logged.
  - The 6.14.0 release note: "A handler that calls `log.info`, `log.warn`, `log.debug` or `log.error` now gets its access line as well. […] The custom line is written before the response exists. It shows `-` where the status goes in the text and file formats, and has no `status` in the JSON line or in transport records. The access line follows with the real status, the full `durationMs`, the response-phase enricher fields and any AI usage merged during the request."
  - `packages/logixlysia/src/utils/error.ts:231-236` — a logged error keeps `stack` unless the error's own `status` is below 500.
  - Observed output for `throw new Error('Something went wrong!')` under the default config: one console line `… ERROR GET /boom 500 4ms Something went wrong!` followed by `└─ error.at  <file>:<line>:<column>`, and no stack; under `preset: 'json'` the console line is JSON with `"error":{"message":…,"name":"Error","stack":"Error: Something went wrong!\n    at …"}`; a transport's `meta.error` has `message`, `name` and `stack` in both cases.
  - `apps/docs/content/features/transports.mdx:56` already says it correctly: "An error line adds `status`, `message` and `error`, a plain object with […] plus `stack` unless the error's own `status` is below 500."

Repo conventions that apply:

- Markdown and MDX are formatted by oxfmt through `bun run format`, and checked by `bun run lint`. Let the formatter decide wrapping and table alignment.
- The docs voice is plain and direct: short declarative sentences, no marketing words, no "simply", no exclamation marks. Code identifiers go in backticks.
- `SKILL.md` uses ` ```typescript ` fences; the docs site uses ` ```ts `. Keep each file's own style.
- `bun run typecheck` compiles every ` ```ts ` fence in `apps/docs/content`. This plan adds no code fence to the two `.mdx` files.

## Commands you will need

Run from the root of your checkout.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Lint + format check | `bun run lint` | exit 0 |
| Typecheck (includes the docs snippet check) | `bun run typecheck` | exit 0 |

Notes that are facts about this repository:

- `turbo` (behind `bun run typecheck`) can append an agent-guidance block to `AGENTS.md`. If `git status --short` ever shows `AGENTS.md` as modified, run `git checkout -- AGENTS.md`. Never commit `AGENTS.md`.
- Never run `bun install` without `--frozen-lockfile`. Never commit `bun.lock`, `dist/`, `.turbo/`, `node_modules/` or anything under `plans/`.

## Scope

**In scope** (the only files you should modify):

- `skills/logixlysia/SKILL.md`
- `apps/docs/content/usage.mdx` (one sentence)
- `apps/docs/content/adapters/overview.mdx` (one clause)

**Out of scope** (do NOT touch, even though they look related):

- Anything under `packages/logixlysia/`. This plan changes no code and adds no changeset.
- `AGENTS.md` — its "`dist/` for 15 entries" is wrong (the build has 16 entries), but another open pull request already rewrites that line.
- `apps/docs/content/api-reference.mdx`, `configuration.mdx`, `faq.mdx`, `integrations/ai.mdx` — another open pull request is editing them.
- `apps/docs/content/features/transports.mdx`, `apps/docs/content/integrations/otel.mdx` — owned by other plans in this series.
- `SECURITY_MODEL.md`, `README.md`, `packages/logixlysia/README.md`, `.agents/**`.
- The sentence in section 13 of `SKILL.md` about `logixlysia/otel` merging `trace_id` and `span_id`. Leave it as it is.
- Rewording, reordering or "improving" any part of `SKILL.md` this plan does not name.

## Git workflow

- Branch: `docs/skill-and-usage-accuracy`, created from `origin/main` (the operator may already have created it for you; if you are on it, do not create another).
- Two commits, in this order, with these subjects (Conventional Commits, lower case after the colon, no trailing period):
  1. `docs(skill): describe the access line, logixlysia/http and the newer options` — `skills/logixlysia/SKILL.md`.
  2. `docs: say where a server error's stack is written` — `apps/docs/content/usage.mdx` and `apps/docs/content/adapters/overview.mdx`.
- Each commit message has the subject, a blank line, then one or two short paragraphs of plain prose wrapped at 72 columns that say what was wrong and what the change does. No bullet lists, no headings.
- Stage files by name (`git add <path> …`). Never `git add -A`, `git add .` or `git commit -a`.
- No `Co-Authored-By`, `Signed-off-by` or "Generated with" line. No mention of AI assistants, agents or models as the author of the change anywhere. (The skill file is written _for_ coding agents and says so already; that is fine. Do not add anything about who wrote this change.)
- If `git commit` fails because commit signing is unavailable, retry that commit as `git -c commit.gpgsign=false commit …`. Never change git configuration.
- Do NOT push and do NOT open a pull request. The operator does both.

## Steps

### Step 1: `SKILL.md` — the access line is always written

Replace line 58 (the paragraph that starts "A custom log that passes `logFilter`") with this paragraph:

```markdown
A handler's own lines (`log.info`, `store.logger.info(request, …)`, `useLogger().info`) are written in addition to the request's access line. They are written before the response exists, so they carry no status. The access line follows with the status the client got, the full `durationMs` and the response-phase enricher fields.
```

Replace line 330 (the sentence that starts "`logixlysia/ai` merges LLM usage") with:

```markdown
`logixlysia/ai` merges LLM usage under `ai` in the request context, so it appears on the request's access line:
```

**Verify**: `rg -n "replaces" skills/logixlysia/SKILL.md` → no matches.

### Step 2: `SKILL.md` — `log.error` with a caught value

In section 2, directly before the paragraph you rewrote in Step 1, add this subsection (after the closing fence of the `/order/checkout` example):

````markdown
### Logging a Caught Error

`log.error` takes a message or whatever you caught. A caught value is serialized like a thrown error, with its name, its `HttpError` fields and its cause.

```typescript
app.post('/pay', async ({ log }) => {
  try {
    await charge()
  } catch (err) {
    log.error(err, { step: 'payment' })
  }
  return { success: false }
})
```
````

**Verify**: `rg -n "log.error\(err" skills/logixlysia/SKILL.md` → one match.

### Step 3: `SKILL.md` — `redactPatterns` in the config example

In the config example of section 3, replace the two lines

```typescript
      // Auto-redaction of PII (emails, JWTs, card numbers)
      autoRedact: true,
```

with

```typescript
      // Auto-redaction of PII (emails, JWTs, card numbers)
      autoRedact: true,
      redactPatterns: [/cust_[a-z0-9]+/], // Extra value shapes to mask; needs autoRedact: true
```

**Verify**: `rg -n "redactPatterns" skills/logixlysia/SKILL.md` → one match.

### Step 4: `SKILL.md` — `logixlysia/http` and `minLevel` in section 7

Directly after line 179 (the paragraph that starts "The available destinations:"), still inside section 7 and before its closing `---`, add:

````markdown
`logixlysia/http` exports `createHttpTransport`, the batching, retrying core the built-in destinations share. For a backend that takes an HTTP POST, describe the request body and it gives you batching, retry with backoff, a bounded queue, `onDropped`, `flush` and `close`. A `log` you write yourself gets none of that.

```typescript
import { createHttpTransport, entryText } from 'logixlysia/http'

const elasticsearch = createHttpTransport({
  name: 'elasticsearch',
  url: 'http://elasticsearch:9200/logs/_bulk',
  headers: { 'Content-Type': 'application/x-ndjson' },
  options: { maxBatchSize: 100, onError: console.error },
  body: entries =>
    entries
      .map(entry =>
        [
          JSON.stringify({ index: {} }),
          JSON.stringify({
            ...entry.meta,
            level: entry.level,
            message: entryText(entry),
            '@timestamp': entry.timestamp.toISOString()
          })
        ].join('\n')
      )
      .join('\n') + '\n'
})
```

Set `minLevel` on any transport to send it only records at that level or louder. The levels, quietest first, are `DEBUG`, `INFO`, `WARNING` and `ERROR`.

```typescript
import { createAxiomTransport } from 'logixlysia/axiom'
import { createSentryTransport } from 'logixlysia/sentry'

logixlysia({
  config: {
    transports: [
      createSentryTransport({ minLevel: 'ERROR' }),
      createAxiomTransport()
    ]
  }
})
```
````

**Verify**: `rg -c "logixlysia/http" skills/logixlysia/SKILL.md` → `2`; `rg -n "minLevel" skills/logixlysia/SKILL.md` → at least two matches.

### Step 5: `SKILL.md` — `tail.keep` in section 8

In section 8, replace the first paragraph and the example (lines 185-201, quoted in "Current state") with:

````markdown
`config.sampling.head` keeps a percentage of records per level as they're emitted; levels left out keep everything. `config.sampling.tail` rescues head-dropped records for a request once its outcome is known, by status, duration, path glob, or a `keep` predicate. `keep` receives `durationMs`, `pathname`, `status` and a copy of the request's `context`, and runs only when no other tail rule matched.

```typescript
logixlysia({
  config: {
    sampling: {
      head: { DEBUG: 1, INFO: 10 },
      tail: {
        status: 400,
        durationMs: 1000,
        paths: ['/checkout/**'],
        keep: ({ context, status }) =>
          context.plan === 'enterprise' && status >= 400
      },
      maxBufferedPerRequest: 100 // default
    }
  }
})
```
````

Leave the sentence "Sampling is off unless at least one head rate is below `100`." as it is.

**Verify**: `rg -n "keep" skills/logixlysia/SKILL.md` → at least two matches.

### Step 6: `SKILL.md` — two new sections at the end

Append to the end of the file (after the closing fence of the `mergeAIMetrics` example), keeping the file's pattern of a `---` line between sections:

````text

---

## 14. Choosing what is logged

`config.logFilter` chooses routes by pathname glob (`**` crosses `/`, `*` and `?` do not). `exclude` silences the routes it names, `include` logs only the routes it names, and `exclude` beats `include`. An excluded request writes nothing: no access line, no handler lines and no error line, even when it answers `500`.

```typescript
logixlysia({
  config: {
    logFilter: {
      include: ['/api/**'],
      exclude: ['/api/internal/**', '/health']
    }
  }
})
```

`logFilter.accessLine` hides only the access line of the paths it names. A handler's `log.*` lines still write, and a response with status `400` or above, or a thrown error, is never hidden. Use it for health checks whose failures should still be logged.

```typescript
logixlysia({
  config: {
    logFilter: {
      accessLine: { exclude: ['/health', '/metrics'] }
    }
  }
})
```

---

## 15. Background jobs

`runJob` lives on the plugin instance: `plugin.runJob(name, fn)`. It runs `fn` outside a request and writes one final line for it through every sink, labelled `JOB` with the job name as its path: status `200` when `fn` returns, `500` when it throws. A thrown error is logged and then rethrown. Inside `fn`, `useLogger()` returns the job's logger without `useAsyncLocalStorage`.

```typescript
import { flushLogixlysia, logixlysia } from 'logixlysia'
import type { Options } from 'logixlysia'

const options: Options = { config: { service: 'billing' } }
const logs = logixlysia(options)

await logs.runJob('nightly-sync', async log => {
  const rows = await loadRows()
  log.mergeContext({ rows: rows.length })
})

// A script exits as soon as the job returns; flush so batching transports send first.
await flushLogixlysia(options)
```
````

Then run `bun run format`.

**Verify**:

- `rg -n "^## 1[45]\. " skills/logixlysia/SKILL.md` → two matches (`## 14. Choosing what is logged`, `## 15. Background jobs`).
- This loop prints nothing (every published subpath is named in the skill):

  ```sh
  for s in otel enrichers ai axiom hyperdx sentry posthog otlp datadog better-stack loki clickhouse desertant errors http; do rg -q "logixlysia/$s" skills/logixlysia/SKILL.md || echo "MISSING $s"; done
  ```

- `bun run lint` → exit 0.

### Step 7: Commit the skill

Stage `skills/logixlysia/SKILL.md` and commit with subject 1 from "Git workflow".

**Verify**: `git show --stat --format=%s HEAD` → the subject, and exactly one file.

### Step 8: `usage.mdx` — where the stack goes

In `apps/docs/content/usage.mdx`, in the paragraph under `## Error Handling` quoted in "Current state", replace the last sentence, "It does not log stack traces.", with:

```markdown
The console does not print a stack trace; for a server error it shows where the error was thrown, as `error.at`. [Transports](/docs/features/transports) and the JSON console line receive the error's full `stack`, unless the error's own `status` is below 500.
```

The first two sentences of the paragraph stay as they are.

**Verify**: `rg -n "does not log stack traces" apps/docs/content` → no matches; `rg -n "error.at" apps/docs/content/usage.mdx` → one match.

### Step 9: `overview.mdx` — the copied `Error`

In `apps/docs/content/adapters/overview.mdx`, in the list item that starts `- **Copied at log time** —`, replace the clause

```markdown
an `Error` keeps its `name`, `message`, `cause` and own fields (not its stack),
```

with

```markdown
an `Error` stored in a field keeps its `name`, `message`, `cause` and own fields (not its stack; the record's own `error` is already a plain object and keeps the `stack` of a server error),
```

Change nothing else in that list item.

Run `bun run format`, then stage `apps/docs/content/usage.mdx` and `apps/docs/content/adapters/overview.mdx` and commit with subject 2.

**Verify**: `rg -n "stored in a field" apps/docs/content/adapters/overview.mdx` → one match; `git status --short` → empty.

### Step 10: Full gates

**Verify**:

- `bun run lint` → exit 0.
- `bun run typecheck` → exit 0 (this runs the docs snippet check; restore `AGENTS.md` with `git checkout -- AGENTS.md` if turbo touched it). If it fails because `packages/logixlysia/dist` is missing, run `bun run build --filter logixlysia` once and repeat.
- `git diff --name-only origin/main...HEAD` → exactly the three in-scope files.

## Test plan

There is no code change, so there are no new tests. The checks are the greps in each step, the subpath loop in Step 6, `bun run lint` (formatting of all three files) and `bun run typecheck` (the docs snippet check still passes).

## Done criteria

ALL must hold:

- [ ] `bun run lint` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `rg -n "replaces" skills/logixlysia/SKILL.md` returns nothing
- [ ] `rg -n "does not log stack traces" apps/docs/content` returns nothing
- [ ] The subpath loop from Step 6 prints nothing
- [ ] `rg -c "^## [0-9]+\. " skills/logixlysia/SKILL.md` prints `15`
- [ ] `git diff --name-only origin/main...HEAD` lists exactly the three in-scope files
- [ ] `git log --format=%s origin/main..HEAD` shows the two subjects from "Git workflow", newest first
- [ ] `git log --format=%B origin/main..HEAD | rg -i "co-authored|signed-off|generated with"` returns nothing
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you)

## STOP conditions

Stop and report back (do not improvise) if:

- A line quoted in "Current state" is not in the file as quoted.
- `bun run format` changes a file outside the three in scope.
- `bun run lint` fails on one of the three files in a way `bun run format` does not fix.
- You find another statement in one of the three files that you believe is false. Report it with the line number; do not fix it in this plan.

## Maintenance notes

- `SKILL.md` is hand-kept. Its first instruction ties it to `package.json#exports`; the loop in Step 6 is a cheap check a future change can rerun when a subpath is added.
- The `createHttpTransport` and `minLevel` examples in the skill are copies of the ones in `apps/docs/content/features/transports.mdx`, which the docs snippet check compiles. The skill's copies are not compiled, so change both together.
- A reviewer should read the four rewritten sentences against the facts listed under "Current state" and confirm nothing else in `SKILL.md` moved.
- Deferred on purpose: `AGENTS.md`'s entry count (in another pull request), an expanded "Existing controls" list in `SECURITY_MODEL.md` (the maintainer's call), and a note next to the `{ip}` token that `x-forwarded-for` is client-controlled without a trusted proxy.
