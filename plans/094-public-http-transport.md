# Plan 094: `logixlysia/http` lets anyone write a batched, retried adapter

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report. A reviewer dispatched you and maintains `plans/README.md`, so do not edit the index.
>
> **Drift check (run first)**: `git diff --stat 0873da0..HEAD -- packages/logixlysia/src/adapters/shared.ts packages/logixlysia/bunup.config.ts packages/logixlysia/package.json apps/docs/content/features/transports.mdx`. Plan 089 adds `minLevel` to `shared.ts` and a section to `transports.mdx`; anything else that does not match the excerpts is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (freezes `LogEntry` and `BatchTransportOptions` as public contract)
- **Depends on**: `plans/089-transport-min-level.md`
- **Category**: direction
- **Planned at**: commit `0873da0`, 2026-11-06

## Why this matters

`createHttpTransport` gives all nine built-in adapters batching, retry with backoff, bounded queues and `onDropped`. None of it is exported, so a tenth backend (Elasticsearch, a webhook, an in-house collector) either hand-rolls it or goes without. The docs teach exactly that: their Elasticsearch example posts once per record with no retry. After this plan a custom adapter is ten lines and behaves like the built-in ones.

## Current state

`packages/logixlysia/src/adapters/shared.ts`:

```ts
export interface HttpTransportInput {
  body: (entries: LogEntry[]) => string
  headers: Record<string, string>
  name: string
  options: BatchTransportOptions
  url: string
}

export const createHttpTransport = (input: HttpTransportInput): AdapterTransport => { ... }

export const defaultBody = (entry: LogEntry): string => { ... }
```

`LogEntry` is at `:97` (`level`, `message`, `meta`, `timestamp`). `defaultBody` matters because access lines have an empty `message`; it gives them `METHOD /path`.

Measured against a local server: a 503 was retried, `BigInt` and `Date` reach `body` as strings, and a throwing `body` rejects and reports `send-failed` with count 1.

`packages/logixlysia/bunup.config.ts` lists entries (`'src/desertant.ts'` is last). `packages/logixlysia/package.json` has an `exports` map; exemplar:

```json
"./desertant": {
  "types": "./dist/desertant.d.ts",
  "import": "./dist/desertant.js",
  "default": "./dist/desertant.js"
},
```

`__tests__/api/surface.test.ts` snapshots each subpath's named exports. `AGENTS.md:13` says `dist/` for 14 entries.

`apps/docs/content/features/transports.mdx`, under `## External Services`, `### Elasticsearch`, has a `fetch` per record inside `log`. `elasticsearchTransport` is also used by name later on the page (around lines 132 and 145).

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun run build && bun test` | all pass |
| API snapshot | `cd packages/logixlysia && bun run build && bun test --update-snapshots __tests__/api` | one new subpath in the snapshot |

## Scope

**In scope**: `packages/logixlysia/src/http.ts` (create), `src/adapters/shared.ts` (JSDoc only), `packages/logixlysia/bunup.config.ts`, `packages/logixlysia/package.json`, `__tests__/api/__snapshots__/*`, `__tests__/adapters/http.test.ts` (create), `apps/docs/content/features/transports.mdx`, `apps/docs/content/adapters/overview.mdx`, `AGENTS.md` (line 13 only), `.changeset/public-http-transport.md` (create).

**Out of scope**: renaming `defaultBody` inside the adapters, flattening `options` into the input (a tenth adapter passes its caller's options straight through, and a flat spread risks `options.url` overriding the resolved URL), exporting `postWithRetry` or `createBatchQueue` or `flattenMeta`, and any other turbo-appended text in `AGENTS.md`.

## Git workflow

Branch `improve/094-public-http-transport` from the worktree HEAD. Conventional commits with no attribution trailer, e.g. `feat(adapters): export createHttpTransport from logixlysia/http`. Do not push. Turbo appends a block to `AGENTS.md`: run `git checkout -- AGENTS.md` before making your one-line edit there, and check `git diff AGENTS.md` shows only that line.

## Steps

### Step 1: The subpath

Create `src/http.ts`:

```ts
export {
  createHttpTransport,
  defaultBody as entryText
} from './adapters/shared'
export type {
  AdapterTransport,
  BatchTransportOptions,
  HttpTransportInput,
  LogEntry
} from './adapters/shared'
```

Add `'src/http.ts'` to bunup's `entry`, and a `"./http"` block to `exports` before `"./package.json"`. Add JSDoc in `shared.ts` to `createHttpTransport`, `HttpTransportInput`'s fields, `LogEntry` and `defaultBody`, written for someone outside this repo: `name` labels errors, `body` receives one batch and returns the request body, `options` is the caller's batching options passed straight through, `defaultBody` returns the message, or `METHOD /path` for an access line.

**Verify**: `cd packages/logixlysia && bun run build && ls dist/http.js dist/http.d.ts` succeeds. `bun test --update-snapshots __tests__/api` adds only `./http` with `createHttpTransport` and `entryText`.

### Step 2: Tests

Create `__tests__/adapters/http.test.ts`, using `stubFetch` from `__tests__/adapters/helpers.ts`, importing from `../../src/http`:

1. Two `log` calls and `flush()` produce one POST with both entries, the given headers, and what `body` returned.
2. A 503 then a 200 retries and delivers once.
3. Options pass through: `onDropped` fires with `send-failed` when every attempt fails, and `minLevel` is exposed on the transport.
4. `entryText` returns the message, and `POST /x` for an entry with an empty message and `meta.request`.
5. A throwing `body` reports `send-failed` with count 1 and does not throw at the caller of `log`.

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters/http.test.ts` passes.

### Step 3: Docs

Replace the `### Elasticsearch` example in `transports.mdx`, keeping the name `elasticsearchTransport`:

```ts
import { createHttpTransport, entryText } from 'logixlysia/http'

const elasticsearchTransport = createHttpTransport({
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

Add one sentence above it on what this gives you: batching, retry, a bounded queue, `onDropped`, `flush` and `close`. Say that a `log` you write yourself gets none of that. Leave the MongoDB and Slack examples. In `adapters/overview.mdx`, add a short `## Your Own Backend` paragraph linking to that section. Create `.changeset/public-http-transport.md` with `'logixlysia': minor`. Change `AGENTS.md:13` to `dist/` for 15 entries.

**Verify**: `bun run format`, then `bun run lint` exits 0.

## Test plan

Step 2, plus the API snapshot. Existing adapter suites stay green.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0.
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the new tests and the updated snapshot.
- [ ] `git diff --stat -- packages/logixlysia/__tests__/api/__snapshots__` shows additions only.
- [ ] `git diff AGENTS.md` shows only the entry count.
- [ ] `git status` shows only in-scope files.

## STOP conditions

- The snapshot diff shows a change other than the new subpath.
- `dist/http.d.ts` pulls in internal types that are not exported, leaving a public type unnameable.

## Maintenance notes

`LogEntry` and `BatchTransportOptions` are now public. A breaking change to either is a major version bump. A reviewer should read the JSDoc as an outsider would.
