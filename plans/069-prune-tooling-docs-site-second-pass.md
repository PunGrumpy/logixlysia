# Plan 069: Bench, video, docs site and playground, second pass: delete 26 comment lines, give evlog a true dispatch floor, and name four things comments explained

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7dea942..HEAD -- packages/bench/index.bench.ts packages/video/src/scenes/act3-reveal.tsx apps/docs/components/home/adapters.astro apps/docs/components/home/demo.astro apps/docs/components/home/file-row.astro apps/docs/components/home/term-line.astro apps/docs/blume.config.ts apps/docs/scripts/typecheck-snippets.ts apps/docs/scripts/skip-ci.mjs apps/docs/theme.css apps/elysia/src/routers/request-context.ts` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `7dea942`, 2026-10-24

## Why this matters

The benchmark's "overhead floor" suite says in a comment that evlog "can only be switched off process-wide", so its floor case still assembles a wide event and is "not a pure dispatch floor". That claim is false: evlog's Elysia plugin takes an `exclude` list of path patterns and returns before building an event when the path matches. The bench can measure a true floor and drop the apology. In the promo video two comments explain that a shared `12` is the hand-off window between the field and the orb; two named constants carry that. In the docs site a `delay` field needs a doc to say it is in milliseconds, and a watch list needs a doc to say why the package manifest is in it; a suffix and a constant carry those. The `theme.css` header says `home.css` loads "only on the homepage" while `pages/2026.astro` imports it too. The rest is narration of the next line.

## Current state

### Deletions (Appendix B, 9 ranges, 26 lines, 6 files)

- `packages/bench/index.bench.ts:18-21` restates the `BENCH_BASELINE` branches and what `bench.yml` does; `:322-328` narrates the structured-sink suite's design; `:374-376` narrates the file-sink suite and misnames the call site.
- `apps/docs/components/home/adapters.astro:14-15`: `import ... from 'simple-icons'` and `icon: siGrafana.path` on the Loki entry show the provenance; CC0 needs no notice.
- `apps/docs/components/home/demo.astro:558` restates `lines.at(-1)` and `cursor.before(fragment)`.
- `apps/docs/components/home/file-row.astro:7`: `pct` says percent; the 10 MB cap is demo data from `features.astro`.
- `apps/docs/blume.config.ts:6-7` is history ("old Fumadocs site"); `legacyDocsPaths` and `redirects` say the rest. `:34-36` restates the `mintlifyWidgetId` ternary and the thrown message.
- `apps/docs/scripts/typecheck-snippets.ts:52-54` narrates `PRELUDE` and admits its one imprecision is harmless.

### The bench floor, `packages/bench/index.bench.ts`

Lines 278-286:

```ts
const evlogApp = new Elysia()
  .use(
    evlog({
      drain: () => {
        /* benchmark noop */
      }
    })
  )
  .get('/', () => 'ok')
```

Lines 296-312:

```ts
// evlog can only be switched off process-wide (`initLogger({ enabled: false })`),
// which would also silence the other evlog suites, so its "floor" case
// (evlogApp) still assembles and drains a wide event per request and is not a
// pure dispatch floor. bogeychan (`enabled: false`) and logixlysia (all sinks
// disabled) are true floors.
suite('Elysia plugin request path — overhead floor (all sinks disabled)', [
  [
    'logixlysia',
    async () => {
      await logixlysiaApp.handle(new Request('http://localhost/'))
    }
  ],
  [
    'evlog',
    async () => {
      await evlogApp.handle(new Request('http://localhost/'))
    }
  ],
```

`evlogApp` is also used by the structured-sink suite further down, which must keep draining events. In the installed evlog, `node_modules/evlog/dist/middleware-fam3VyaL.mjs:21` passes `options.exclude` through, and `node_modules/evlog/dist/deferred-drain-CfRYimo5.mjs:3-5` (`shouldLog(path, include, exclude)`) returns `false` when any `exclude` pattern matches the path, before an event is built. `RUN_OPTIONS` (line 38) is `{ time: 500 }`; `packages/bench/package.json` has `"bench": "vitest bench"` and `"typecheck": "tsc --noEmit"`.

### The video hand-off, `packages/video/src/scenes/act3-reveal.tsx`

Line 23: `const ORB_COLLAPSE_AT = sec(0.2)`. Lines 106-111:

```tsx
// Act 2 ends on the full-bleed field; hold it while the orb takes over so
// the two gradients cross-fade instead of cutting.
const handoff = progress(frame, ORB_COLLAPSE_AT, ORB_COLLAPSE_AT + 12)
// The field stays opaque until the orb fully covers it, so no frame shows
// two half-transparent layers over black.
const fieldOut = 1 - progress(frame, ORB_COLLAPSE_AT + 12, ORB_COLLAPSE_AT + 18)
```

`packages/video/package.json` has `"typecheck": "tsc --noEmit"`.

### The replay delay, `apps/docs/components/home/`

`term-line.astro` (whole file, 15 lines):

```astro
---
import TermPart from './term-part.astro'

interface Props {
  cls?: string
  delay?: number
  parts: [cls: string, text: string, hook?: string][]
}

const { cls, delay, parts } = Astro.props
---

<div data-delay={delay} class:list={['whitespace-pre', cls]}>
  {parts.map(part => <TermPart cls={part[0]} hook={part[2]} text={part[1]} />)}
</div>
```

`demo.astro:12-17`:

```ts
interface TermLineData {
  cls?: string
  /** Pause in ms before this line prints during the replay animation. */
  delay?: number
  parts: TermPart[]
}
```

`demo.astro` also has eight `delay: <number>,` entries inside the `termLines` array (lines 48, 60, 75, 90, 105, 120, 136, 151), `<TermLine cls={line.cls} delay={line.delay} parts={line.parts} />` at line 336, and `}, Number(line.dataset.delay) || 40)` at line 475. The DOM maps the attribute `data-delay-ms` to `dataset.delayMs`.

### The watch list, `apps/docs/scripts/skip-ci.mjs:7-15`

```js
// Everything the docs build reads. `lib/version.ts` imports the package's
// version and the homepage renders it, so a release must rebuild the docs.
const WATCHED = [
  'apps/docs',
  'packages/logixlysia/package.json',
  'packages/typescript-config',
  'bun.lock',
  'turbo.json'
]
```

### Two false notes

`apps/docs/theme.css:1-7`:

```css
/*
 * Blume's last-cascade-layer overrides. Blume appends this file to the end of
 * the generated stylesheet ("config first, then the user's theme.css"), so
 * anything here wins without specificity tricks — which is exactly what a
 * page-scoped sheet like styles/home.css cannot do, since Astro inlines that
 * one *before* the linked Tailwind stylesheet and only on the homepage.
 */
```

`apps/docs/pages/index.astro:4` and `apps/docs/pages/2026.astro:4` both `import '../styles/home.css'`.

`apps/elysia/src/routers/request-context.ts:2-4`:

```ts
// `useLogger` is logixlysia's AsyncLocalStorage lookup, not a React hook; the
// alias keeps the React hook rules from treating this helper as a component.
import { useLogger as currentRequestLogger } from 'logixlysia'
```

The rule (`rules-of-hooks`, an error in Ultracite's React preset) flags a `use`-prefixed call made from a function that is neither a component nor a hook; it does not treat the helper as a component.

### Repo facts

- Bun 1.3.14 workspaces with Turborepo. `packages/bench` is a vitest benchmark package, `packages/video` a Remotion promo, `apps/docs` the Blume docs site (Astro), `apps/elysia` a playground app. None of these is published, so no changeset is needed; nothing under `packages/logixlysia/` changes in this plan.
- `origin/main` is `7dea942` ("Version Packages (#524)"). A local `main` may lag behind it; this plan is written against `7dea942` and the branch must start there.
- Lint and format are Ultracite (oxlint and oxfmt). `bun run lint` runs both and fails on any finding, in `.astro`, `.mjs`, `.tsx` and `.css` files too. Never turn a rule off and never add an `oxlint-disable` comment.
- The maintainer keeps homepage data and classes inline per component; do not extract shared helpers or palettes in `apps/docs`.
- `turbo` appends a block marked `<!-- BEGIN:turborepo-agent-rules -->` to `AGENTS.md` when it detects an AI agent. That change is not part of this plan: run `git checkout -- AGENTS.md` before every commit and never stage `AGENTS.md`.
- The repo signs commits through 1Password, which an agent session cannot reach. Commit with `git -c commit.gpgsign=false commit ...` and say so in your report.
- The docs build (`blume build`) fetches GitHub releases for the changelog; offline it logs a warning and continues. That warning is not a failure.

## Commands you will need

| Purpose | Command (worktree root unless noted) | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck (all workspaces) | `bun run typecheck` | exit 0 |
| Bench typecheck | `cd packages/bench && bun run typecheck` | exit 0 |
| Bench run | `cd packages/bench && bun run bench -- --run` | exit 0; prints a table per suite |
| Video typecheck | `cd packages/video && bun run typecheck` | exit 0 |
| Docs build | `bun run build --filter docs --force` | exit 0 |

## Scope

**In scope** (the only files you may modify):

- `packages/bench/index.bench.ts`
- `packages/video/src/scenes/act3-reveal.tsx`
- `apps/docs/components/home/adapters.astro`
- `apps/docs/components/home/demo.astro`
- `apps/docs/components/home/file-row.astro`
- `apps/docs/components/home/term-line.astro`
- `apps/docs/blume.config.ts`
- `apps/docs/scripts/typecheck-snippets.ts`
- `apps/docs/scripts/skip-ci.mjs`
- `apps/docs/theme.css`
- `apps/elysia/src/routers/request-context.ts`

**Out of scope** (do NOT touch):

- `packages/bench/index.bench.ts:63-72` (the evlog console/drain note) and `:35-37`: vendor facts that stay.
- `packages/video/src/scenes/act1-scatter.tsx:19` (units of the word table), `packages/video/src/promo.tsx:9-12` (the scene-boundary invariant): they stay.
- `apps/docs/components/home/demo.astro:2-5` (the note that the demo mirrors real output) and `features.astro:2` (where demo data lives): they stay.
- `apps/docs/scripts/typecheck-snippets.ts:223-224` (why every fence is tracked): no test pins it, so it stays.
- `apps/docs/theme.css` beyond lines 5-6; `.github/**`; `apps/elysia/demo.tape`; anything under `packages/logixlysia/`; `.changeset/`.

## Git workflow

- Branch: `improve/069-prune-tooling-docs-site-second-pass`, created in Step 0 from `7dea942`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log`.
- Commit with `git -c commit.gpgsign=false commit -m "<subject>"`.
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git rev-parse --short origin/main` → `7dea942`. If not, STOP.
2. `git switch -c improve/069-prune-tooling-docs-site-second-pass 7dea942`. If that branch already exists, STOP.
3. `bun install --frozen-lockfile` → exit 0.
4. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0. If either fails before you changed anything, STOP.
5. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

1. `mkdir -p /tmp/prune-069`. Save Appendix A verbatim as `/tmp/prune-069/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-069/spec.txt`.
2. From the worktree root: `bun /tmp/prune-069/prune-comments.ts /tmp/prune-069/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means a file drifted from `7dea942`: STOP and report it.
3. `bun /tmp/prune-069/prune-comments.ts /tmp/prune-069/spec.txt` → `removed 26 comment lines across 6 files`.
4. `bun run format` → exit 0. `bun run lint` → exit 0. `bun run typecheck` → exit 0.
5. `git checkout -- AGENTS.md`. `git status --short` lists only the six files in Appendix B.
6. **Commit**: `chore: drop comments in the bench, the docs site and the video that restate the code`

### Step 2: Measure evlog's dispatch floor with a path exclude

In `packages/bench/index.bench.ts`:

1. Directly after the `evlogApp` definition (after its `.get('/', () => 'ok')` line), add

```ts
const evlogFloorApp = new Elysia()
  .use(
    evlog({
      drain: () => {
        /* benchmark noop */
      },
      exclude: ['/**']
    })
  )
  .get('/', () => 'ok')
```

2. Delete the five-line comment above `suite('Elysia plugin request path — overhead floor (all sinks disabled)', [` (the one that starts "evlog can only be switched off process-wide").
3. In that floor suite only, change `await evlogApp.handle(new Request('http://localhost/'))` to `await evlogFloorApp.handle(new Request('http://localhost/'))`. The structured-sink suite further down keeps `evlogApp`.
4. `bun run format` → exit 0. `cd packages/bench && bun run typecheck` → exit 0. If `tsc` rejects `exclude`, STOP and report the error text (the installed evlog's middleware reads `options.exclude`; a type that lacks it is a finding).
5. `bun run lint` → exit 0.
6. `cd packages/bench && bun run bench -- --run` → exit 0 and the output contains a table for `Elysia plugin request path — overhead floor (all sinks disabled)` with three rows (`logixlysia`, `evlog`, `bogeychan`). Note the evlog row's ops/sec in your report; it should be no slower than before (there is no stored baseline, so this is a sanity check, not a gate).

**Commit**: `fix(bench): measure evlog's dispatch floor with a path exclude`

**Verify**: `grep -c 'evlogFloorApp' packages/bench/index.bench.ts` → `2`; `grep -c 'switched off process-wide' packages/bench/index.bench.ts` → `0`.

### Step 3: Name the orb hand-off and field fade windows

In `packages/video/src/scenes/act3-reveal.tsx`:

1. Directly after `const ORB_COLLAPSE_AT = sec(0.2)`, add

```ts
const HANDOFF_FRAMES = 12
const FIELD_FADE_FRAMES = 6
```

2. Replace

```tsx
// Act 2 ends on the full-bleed field; hold it while the orb takes over so
// the two gradients cross-fade instead of cutting.
const handoff = progress(frame, ORB_COLLAPSE_AT, ORB_COLLAPSE_AT + 12)
// The field stays opaque until the orb fully covers it, so no frame shows
// two half-transparent layers over black.
const fieldOut = 1 - progress(frame, ORB_COLLAPSE_AT + 12, ORB_COLLAPSE_AT + 18)
```

with

```tsx
const handoffEnd = ORB_COLLAPSE_AT + HANDOFF_FRAMES
const handoff = progress(frame, ORB_COLLAPSE_AT, handoffEnd)
const fieldOut = 1 - progress(frame, handoffEnd, handoffEnd + FIELD_FADE_FRAMES)
```

The frame values are unchanged: `ORB_COLLAPSE_AT + 12` and `+ 18`.

3. `bun run format` → exit 0. `cd packages/video && bun run typecheck` → exit 0. `bun run lint` → exit 0.

**Commit**: `refactor(video): name the orb hand-off and field fade windows`

### Step 4: Carry the replay delay's unit in its name

1. `apps/docs/components/home/term-line.astro`: rename `delay?: number` to `delayMs?: number`, the destructuring `const { cls, delay, parts }` to `const { cls, delayMs, parts }`, and the attribute `data-delay={delay}` to `data-delay-ms={delayMs}`.
2. `apps/docs/components/home/demo.astro`:
   - In `interface TermLineData`, delete the line `  /** Pause in ms before this line prints during the replay animation. */` and rename `delay?: number` to `delayMs?: number`.
   - Rename every `delay:` key inside the `termLines` array to `delayMs:` (eight occurrences).
   - Change `<TermLine cls={line.cls} delay={line.delay} parts={line.parts} />` to `<TermLine cls={line.cls} delayMs={line.delayMs} parts={line.parts} />`.
   - Change `Number(line.dataset.delay) || 40` to `Number(line.dataset.delayMs) || 40`.
3. `grep -nw 'delay' apps/docs/components/home/demo.astro apps/docs/components/home/term-line.astro` → no output (if a CSS `transition-delay` or similar shows up, leave it and note it; it is not this field). `grep -c 'delayMs' apps/docs/components/home/demo.astro` → `11`; `grep -c 'delayMs' apps/docs/components/home/term-line.astro` → `3`.
4. `bun run format` → exit 0. `bun run lint` → exit 0. `bun run typecheck` → exit 0 (this runs `docs#typecheck`, which type-checks the Astro frontmatter through `tsc`).
5. `bun run build --filter docs --force` → exit 0.

**Commit**: `refactor(docs): carry the replay delay's unit in its name`

### Step 5: Name why the package manifest triggers a docs build

In `apps/docs/scripts/skip-ci.mjs`, replace

```js
// Everything the docs build reads. `lib/version.ts` imports the package's
// version and the homepage renders it, so a release must rebuild the docs.
const WATCHED = [
  'apps/docs',
  'packages/logixlysia/package.json',
```

with

```js
const VERSION_SOURCE = 'packages/logixlysia/package.json'
const WATCHED = [
  'apps/docs',
  VERSION_SOURCE,
```

The rest of the array is unchanged.

**Verify**: `bun run lint` → exit 0. `node apps/docs/scripts/skip-ci.mjs; echo "exit=$?"` → prints `exit=0` or `exit=1` without a stack trace (the script decides by `git diff`; either answer is fine, a crash is not).

**Commit**: `refactor(docs): name why the package manifest triggers a docs build`

### Step 6: Correct the home.css load note and the useLogger alias note

1. `apps/docs/theme.css`: in the header comment, replace the two lines

```css
 * page-scoped sheet like styles/home.css cannot do, since Astro inlines that
 * one *before* the linked Tailwind stylesheet and only on the homepage.
```

with

```css
 * page-scoped sheet like styles/home.css cannot do, since Astro inlines that
 * one *before* the linked Tailwind stylesheet and only on the pages that
 * import it.
```

2. `apps/elysia/src/routers/request-context.ts`: replace

```ts
// `useLogger` is logixlysia's AsyncLocalStorage lookup, not a React hook; the
// alias keeps the React hook rules from treating this helper as a component.
```

with

```ts
// `useLogger` is logixlysia's AsyncLocalStorage lookup, not a React hook; the
// alias keeps `rules-of-hooks` from flagging a `use` call inside a plain helper.
```

**Verify**: `bun run lint` → exit 0. `grep -c 'only on the homepage' apps/docs/theme.css` → `0`.

**Commit**: `docs: correct the home.css load note and the useLogger alias note`

### Step 7: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/video && bun run typecheck` → exit 0 (the video package may not be in the turbo graph).
4. `bun run build --filter docs --force` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B 7dea942..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff 7dea942..HEAD | grep -c '^+.*oxlint-disable'` → `0`.
8. `git diff --name-only 7dea942..HEAD | grep -c '^packages/logixlysia/\|^.changeset/'` → `0`.
9. `git diff --name-only 7dea942..HEAD` lists only files from the Scope section.

## Test plan

- No unit tests exist for these workspaces. The gates are typecheck (bench, video, docs), lint, the docs build, and one bench run of the floor suite in Step 2.

## Done criteria

ALL must hold:

- [ ] `bun run lint` and `bun run typecheck` exit 0; `cd packages/video && bun run typecheck` exits 0
- [ ] `bun run build --filter docs --force` exits 0
- [ ] `grep -c 'evlogFloorApp' packages/bench/index.bench.ts` → `2`
- [ ] `grep -c 'HANDOFF_FRAMES\|FIELD_FADE_FRAMES' packages/video/src/scenes/act3-reveal.tsx` → `4`
- [ ] `grep -nw 'delay' apps/docs/components/home/demo.astro apps/docs/components/home/term-line.astro` → no output
- [ ] `grep -c 'VERSION_SOURCE' apps/docs/scripts/skip-ci.mjs` → `2`
- [ ] `git diff --name-only 7dea942..HEAD` lists only files from the Scope section, none under `packages/logixlysia/` or `.changeset/`
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `7dea942`).
- A verification fails twice after a reasonable fix attempt.
- `tsc` rejects `exclude` on evlog's Elysia plugin options (Step 2).
- The docs build fails for a reason other than a network warning about GitHub releases.
- A step would need a file outside the Scope section, or a lint rule turned off.

## Maintenance notes

- The bench's floor suite now compares three apps that skip their logging work per request. If evlog's `exclude` semantics change, the floor row changes meaning; re-read `shouldLog` in evlog's dist before trusting a jump.
- `data-delay-ms` is read by the replay script through `dataset.delayMs`; both sides must change together.
- Deferred on purpose: nothing from this slice beyond the keeps listed under "Out of scope".

## Appendix A: `prune-comments.ts`

```ts
// Deletes exact comment line ranges listed in a spec, bottom-up per file.
// Spec lines: <path>|<start>|<end>|<expected prefix of the trimmed start line>
// Usage: bun prune-comments.ts <spec-file> [--dry-run]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [specPath, flag] = process.argv.slice(2)
if (!specPath) {
  console.error('usage: bun prune-comments.ts <spec-file> [--dry-run]')
  process.exit(2)
}
const dryRun = flag === '--dry-run'
const root = process.cwd()

interface Range {
  end: number
  expected: string
  start: number
}

const byFile = new Map<string, Range[]>()
for (const raw of readFileSync(specPath, 'utf8').split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith(';')) {
    continue
  }
  const [file, start, end, ...rest] = line.split('|')
  const range = {
    end: Number(end),
    expected: rest.join('|').trim(),
    start: Number(start)
  }
  if (!file || !Number.isInteger(range.start) || range.end < range.start) {
    console.error(`bad spec line: ${raw}`)
    process.exit(2)
  }
  const list = byFile.get(file) ?? []
  list.push(range)
  byFile.set(file, list)
}

const LINE_MARKERS = ['//', '#']
const isBlank = (text: string | undefined): boolean =>
  text !== undefined && text.trim() === ''

const checkShape = (lines: string[]): string | undefined => {
  const first = lines[0]?.trim() ?? ''
  const last = lines.at(-1)?.trim() ?? ''
  const marker = LINE_MARKERS.find(m => first.startsWith(m))
  if (marker) {
    const stray = lines.find(l => !l.trim().startsWith(marker))
    return stray === undefined ? undefined : `non-comment line: ${stray.trim()}`
  }
  if (first.startsWith('/*') && last.endsWith('*/')) {
    return
  }
  if (first.startsWith('<!--') && last.endsWith('-->')) {
    return
  }
  return `range is not a whole comment: "${first}" ... "${last}"`
}

let failures = 0
const planned = new Map<string, { lines: string[]; ranges: Range[] }>()
for (const [file, ranges] of byFile) {
  const lines = readFileSync(path.join(root, file), 'utf8').split('\n')
  ranges.sort((a, b) => b.start - a.start)
  for (const range of ranges) {
    const slice = lines.slice(range.start - 1, range.end)
    const head = slice[0]?.trim() ?? ''
    const problem = head.startsWith(range.expected)
      ? checkShape(slice)
      : `expected "${range.expected}", found "${head}"`
    if (problem) {
      failures += 1
      console.error(`MISMATCH ${file}:${range.start}-${range.end}: ${problem}`)
    } else if (dryRun) {
      console.log(`${file}:${range.start}-${range.end}`)
      for (const text of slice) {
        console.log(`    ${text}`)
      }
    }
  }
  planned.set(file, { lines, ranges })
}

if (failures > 0) {
  console.error(`${failures} range(s) did not match. No file was changed.`)
  process.exit(1)
}
if (dryRun) {
  console.log('dry run ok')
  process.exit(0)
}

let removed = 0
for (const [file, { lines, ranges }] of planned) {
  for (const range of ranges) {
    lines.splice(range.start - 1, range.end - range.start + 1)
    if (isBlank(lines[range.start - 2]) && isBlank(lines[range.start - 1])) {
      lines.splice(range.start - 1, 1)
    }
    removed += range.end - range.start + 1
  }
  writeFileSync(path.join(root, file), lines.join('\n'))
}
console.log(`removed ${removed} comment lines across ${planned.size} files`)
```

## Appendix B: deletion spec (`path|start|end|expected start of the first line`)

```text
packages/bench/index.bench.ts|18|21|// BENCH_BASELINE=write stores every result unde
packages/bench/index.bench.ts|322|328|// A no-op transport still exercises data assemb
packages/bench/index.bench.ts|374|376|// `logToFile` is fire-and-forget from `log()` (
apps/docs/components/home/adapters.astro|14|15|// Brand marks come from simple-icons (CC0) wher
apps/docs/components/home/demo.astro|558|558|// Keep the blinking block cursor as the last li
apps/docs/components/home/file-row.astro|7|7|/** Fill of the size meter, as a percentage of t
apps/docs/blume.config.ts|6|7|// The old Fumadocs site served docs from the ro
apps/docs/blume.config.ts|34|36|// Optional Mintlify AI chat widget. Without MIN
apps/docs/scripts/typecheck-snippets.ts|52|54|// A fragment assumes the imports a reader's fil
```
