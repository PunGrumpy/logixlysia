# Plan 063: Prune the docs site's comments and remove CSS nothing uses

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b2a8244..HEAD -- apps/docs/components apps/docs/scripts apps/docs/styles apps/docs/theme.css` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b2a8244`, 2026-10-23

## Why this matters

The homepage components open with comments that repeat the component's file name and props, number their sections twice (a frontmatter comment and an HTML comment for the same `SectionLabel`), and narrate setTimeout chains. Three comments that stay are wrong: `adapters.astro` says Axiom and HyperDX "fall back to monogram chips" (no such chips exist), `features.astro` says its palette "is shared with demo.astro" (it is copy-pasted), and `theme.css` keeps 35 lines of shadcn tokens and a `flush-code` rule for "landing islands and registry components" that no longer exist anywhere in the site or in Blume.

## Current state

- Deletions: Appendix B lists 50 ranges (76 lines) in 17 files.
- `apps/docs/components/home/adapters.astro:14-19`:

```ts
// Nine built-in observability adapters (content/adapters/*.mdx), presented as
// an integrations grid. Names and one-line descriptors mirror the "best for"
// column in the adapters overview. Brand marks come from simple-icons (CC0),
// rendered monochrome; Axiom and HyperDX have no entry there, so they fall
// back to monogram chips. Loki uses the Grafana mark — it is a Grafana Labs
// product.
```

and `:33-35` above `const hyperdxPath`:

```ts
// HyperDX's hexagon-and-bolt mark (hyperdx.io brand asset); the two paths are
// merged so the even-odd rule punches the bolt out of the hexagon and the
// whole mark renders in currentColor.
```

- `apps/docs/components/home/features.astro:2-3`:

```ts
// Demo data lives here so every table row keeps its colors next to its
// values; the dual-theme palette below is shared with demo.astro.
```

`features.astro` and `demo.astro` each declare their own palette object `c`; neither imports the other.

- `apps/docs/components/home/demo.astro:405-409` (the WCAG note must survive):

```ts
// Replay only while the terminal is on screen, not paused by the user,
// and not taken over by the interactive buttons (the visible pause
// control keeps this indefinite replay WCAG 2.2.2 compliant). One
// consumer awaits the gate at a time, so a single `onReady` slot is
// enough.
```

and `:585-587`:

```ts
    // Bounded backlog: the oldest lines scroll away like a real terminal.
    while (body.childElementCount > 28) {
```

- `apps/docs/theme.css:49-92`: an `@theme { ... }` block of shadcn tokens (`--color-card`, `--color-primary`, ..., `--radius-4xl`) with a comment naming "the ported landing islands and registry components"; a `.prose.flush-code :where(pre)` rule; and a `.not-prose :where(p, ul, ol, h1, ...)` reset whose comment names "component-preview islands". At `b2a8244`, nothing under `apps/docs` (components, pages, content, styles) and nothing in `node_modules/blume/src` uses those tokens or `flush-code`. Blume's own components DO use `not-prose` (tabs, accordions, OpenAPI panels, mermaid), so that rule stays.

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
| Tests | `cd packages/logixlysia && bun test` | `703 pass`, `0 fail` once this plan is done (`703 pass` at `b2a8244`) |
| Build | `bun run build` | exit 0 |

## Scope

**In scope** (the only files you may modify or create):

- `apps/docs/components/home/*.astro` (the files in Appendix B, plus `adapters.astro`, `features.astro` and `demo.astro` edits below)
- `apps/docs/scripts/typecheck-snippets.ts` (Step 1 only)
- `apps/docs/styles/home.css`, `apps/docs/theme.css`

**Out of scope** (do NOT touch):

- `apps/docs/content/**` (MDX pages and their code samples).
- `apps/docs/blume.config.ts`, `apps/docs/scripts/skip-ci.mjs`: their comments explain redirects for indexed URLs, an injection guard and Vercel build semantics.
- The duplicated replay loops in `features.astro` and the palette objects: the user keeps homepage data and classes inline per component; do not extract shared modules.

## Git workflow

- Branch: `improve/063-prune-docs-site-comments`, created in Step 0 from `b2a8244`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(logger): log the status the client actually got`).
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git switch -c improve/063-prune-docs-site-comments`. If that branch already exists, STOP.
2. `bun install --frozen-lockfile` → exit 0.
3. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
4. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`. If any fails before you changed anything, STOP.
5. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

A script deletes exact line ranges so none is mistyped. It refuses to write anything if a range does not start with the expected text or is not a whole comment.

1. `mkdir -p /tmp/prune-063`. Save Appendix A verbatim as `/tmp/prune-063/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-063/spec.txt`.
2. From the worktree root: `bun /tmp/prune-063/prune-comments.ts /tmp/prune-063/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `b2a8244`: STOP and report it.
3. `bun /tmp/prune-063/prune-comments.ts /tmp/prune-063/spec.txt` → `removed 76 comment lines across 17 files`.
4. `bun run format` → exit 0. It folds a now-empty multi-line body such as `() => {\n}` into `() => {}`.
5. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `703 pass`, `0 fail`.
6. `git checkout -- AGENTS.md`. `git status --short` lists only files that appear in Appendix B.
7. **Commit**: `chore(docs): drop comments that restate the markup`

**Verify**: `git show --stat HEAD` → 17 files. `git show HEAD | grep '^+' | grep -v '^+++'` prints only lines the formatter re-folded (no new words).

### Step 2: Correct the homepage comments that stay

1. `adapters.astro`: replace the six-line header quoted under "Current state" with

```ts
// Brand marks come from simple-icons (CC0) where it has them. Loki uses the
// Grafana mark, since Loki is a Grafana Labs product.
```

and the three-line HyperDX comment with `// HyperDX's hexagon-and-bolt mark (hyperdx.io brand asset); not in simple-icons.` 2. `features.astro`: replace the two-line header with `// Demo data lives here so every table row keeps its colors next to its values.` 3. `demo.astro`: replace the five-line gate comment with `    // The visible pause control keeps this indefinite replay WCAG 2.2.2 compliant.`

**Verify**: `grep -rn "monogram\|shared with demo.astro" apps/docs/components` → no output. `bun run lint` → exit 0.

**Commit**: `chore(docs): correct the homepage comments that stay`

### Step 3: Remove theme CSS nothing uses

1. Re-run the evidence first; both must print nothing, otherwise STOP:
   - `grep -rEn "(bg|text|border|ring)-(card|popover|primary|secondary|input|sidebar|destructive)|rounded-4xl|flush-code" apps/docs --include=*.astro --include=*.mdx --include=*.ts --include=*.css | grep -v "theme.css\|/dist/\|/.blume/"`
   - `grep -rEn -e "--(color-(card|popover|primary|secondary|input|ring|sidebar|destructive)|radius-4xl)|flush-code" node_modules/blume/src`
2. In `apps/docs/theme.css`, delete the whole `@theme { ... }` block (from `@theme {` to its closing `}`, comment included) and the `.prose.flush-code :where(pre) { ... }` rule with the comment above it.
3. Keep the `.not-prose :where(...)` rule and replace its comment with:

```css
/* Blume's `.prose :where(p, ul, ol)` margins aren't guarded against
   `.not-prose`, so they leak into the `not-prose` blocks inside a page, such
   as Blume's own tabs, accordions and OpenAPI panels. Reset flow-element
   spacing there. */
```

**Verify**: `grep -c "@theme\|flush-code" apps/docs/theme.css` → `0`. `bun run lint` → exit 0. `bun run build` → exit 0 (includes the docs site).

**Commit**: `refactor(docs): remove theme tokens and a code rule nothing uses`

### Step 4: Name the terminal backlog

In `demo.astro`'s `<script>`, declare `const MAX_TERMINAL_LINES = 28` alongside the script's other top-level constants (before the function that uses it), delete the comment `// Bounded backlog: the oldest lines scroll away like a real terminal.`, and change `while (body.childElementCount > 28) {` to `while (body.childElementCount > MAX_TERMINAL_LINES) {`.

**Verify**: `bun run lint` → exit 0. `cd apps/docs && bun run typecheck` → exit 0.

**Commit**: `refactor(docs): name the terminal backlog limit`

### Step 5: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B b2a8244..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff b2a8244..HEAD | grep -c '^+.*oxlint-disable'` → `0`.

## Test plan

- No unit tests cover the homepage. Gates: lint, `apps/docs` typecheck (tsc plus the snippet checker), and the full build including `blume build`.
- If the docs build fails, rerun it on a clean checkout of `b2a8244`. If it fails there too (for example no network for the GitHub changelog), note that and rely on lint and typecheck.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`
- [ ] `git diff --name-only b2a8244..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)
- [ ] `grep -rn "monogram" apps/docs/components` → no output
- [ ] `grep -c "@theme" apps/docs/theme.css` → `0`

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `b2a8244`).
- A verification fails twice after a reasonable fix attempt.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.
- Either evidence grep in Step 3 prints anything.

## Maintenance notes

- If a future component uses shadcn-style tokens (`bg-card`, `text-primary`), define them again in `theme.css` at that point; a Tailwind utility with an undefined color token silently emits no CSS.

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
apps/docs/scripts/typecheck-snippets.ts|113|113|// Names the docs use as placeholders for the re
apps/docs/components/home/context-row.astro|2|4|// 01 · Request context: the full access log rec
apps/docs/components/home/field-row.astro|2|2|// One key/value row in the enrichers fields tab
apps/docs/components/home/sampling-row.astro|2|3|// 03 · Sampling: the shared cells plus a right-
apps/docs/components/home/filter-row.astro|2|4|// 02 · Filtering: the shared cells on a row the
apps/docs/components/home/log-cells.astro|2|3|// The four cells every demo table shares: metho
apps/docs/components/home/route-button.astro|2|3|// One request chip under the hero terminal. Cli
apps/docs/components/home/route-template.astro|2|4|// Hidden <template> holding one route's fully s
apps/docs/components/home/section-badge.astro|2|2|// The small rounded chip beside a section label
apps/docs/components/home/section-label.astro|2|3|// Vercel-style section eyebrow: a small icon (p
apps/docs/components/home/brand-icon.astro|2|4|// Monochrome brand mark rendered in currentColo
apps/docs/components/home/brand-icon.astro|6|6|/** 'evenodd' lets a mark punch holes through ov
apps/docs/components/home/adapter-card.astro|7|7|/** Brand SVG path, rendered monochrome in curre
apps/docs/components/home/term-part.astro|4|4|/** Marks the span so the interactive demo scrip
apps/docs/components/home/demo.astro|6|9|//
apps/docs/components/home/demo.astro|23|23|// Dual-mode terminal palette: muted ink colors
apps/docs/components/home/demo.astro|171|172|// Routes the visitor can fire into the terminal
apps/docs/components/home/demo.astro|393|394|// Flips on the first user-sent request: the scr
apps/docs/components/home/demo.astro|398|398|// Reserve the final height up front so the repl
apps/docs/components/home/demo.astro|451|452|// setTimeout chains instead of awaited loops ke
apps/docs/components/home/demo.astro|496|496|// Clear the screen, then replay the whole sessi
apps/docs/components/home/demo.astro|507|507|// Hold the finished session before clearing for
apps/docs/components/home/demo.astro|520|520|// — Interactive demo: the route chips append re
apps/docs/components/home/demo.astro|534|534|// Land the terminal in its finished state: full
apps/docs/components/home/demo.astro|547|548|// Freeze the height: from here new lines scroll
apps/docs/components/home/features.astro|11|11|// Dual-mode terminal palette: muted ink colors
apps/docs/components/home/features.astro|29|29|// 01 · The full access log record: every column
apps/docs/components/home/features.astro|99|99|// 02 · The filter keeps warnings and errors; th
apps/docs/components/home/features.astro|164|164|// 03 · Head sampling dims the routine rows; the
apps/docs/components/home/features.astro|224|224|// 04 · Fields the enrichers attach to the GET /
apps/docs/components/home/features.astro|233|233|// 05 · The meter shows each file against the 10
apps/docs/components/home/features.astro|242|242|<!-- 01 · Request context -->
apps/docs/components/home/features.astro|330|330|<!-- 02 · Filtering -->
apps/docs/components/home/features.astro|416|416|<!-- 03 · Sampling -->
apps/docs/components/home/features.astro|515|515|<!-- 04 · Enrichers -->
apps/docs/components/home/features.astro|600|600|<!-- 05 · File rotation -->
apps/docs/components/home/features.astro|693|693|// Resolves immediately while `el` is on screen;
apps/docs/components/home/features.astro|715|715|// 01 · Tail the access log: rows arrive one by
apps/docs/components/home/features.astro|720|720|// setTimeout chain instead of an awaited loop:
apps/docs/components/home/features.astro|758|758|// 02 · Replay the raw stream, then apply the fi
apps/docs/components/home/features.astro|764|764|// setTimeout chain instead of an awaited loop:
apps/docs/components/home/features.astro|810|810|// 03 · Head sampling dims the routine rows, the
apps/docs/components/home/features.astro|848|848|// 05 · The live file grows until the size thres
apps/docs/components/home/features.astro|856|856|// setTimeout chain instead of an awaited loop:
apps/docs/styles/home.css|1|4|/* Homepage-only presentational CSS (imported by
apps/docs/styles/home.css|6|8|/* Terminal block cursor, referenced from the Ta
apps/docs/styles/home.css|23|25|/* Animated FAQ disclosure. Pure CSS via ::detai
apps/docs/theme.css|9|9|/* macOS font smoothing for crisper root text */
apps/docs/theme.css|15|15|/* Typography wrapping defaults */
apps/docs/theme.css|32|32|/* Subtle image outlines for consistent surface
```
