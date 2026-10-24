# Plan 062: Prune comments in tooling, the benchmarks, the playground and the promo video

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b2a8244..HEAD -- bunfig.toml oxfmt.config.ts packages/bench apps/elysia packages/video/src` If anything is listed, compare each "before" excerpt below against the live code and rely on the Step 1 dry run, which checks every deletion range. On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b2a8244`, 2026-10-23

## Why this matters

Outside the library, the playground's VHS tape narrates every scene its route names already say, the promo video's scenes open with notes about a "reference" no file defines, and the benchmark file carries two false claims: that evlog has no disabled mode, and that the file sink is fired with `.catch(() => {})`. Two small code shapes only exist with a comment beside them: an empty WebSocket `close` hook in the playground, and a char-code array whose comment spells out the very card number it was built to avoid.

## Current state

- Deletions: Appendix B lists 32 ranges (62 lines) in 12 files.
- `packages/bench/index.bench.ts:299-302` (false):

```ts
// evlog has no fully-disabled mode — its "floor" case (evlogApp, below)
// still assembles and drains a wide event per request, so its number here
// is not a pure dispatch floor. bogeychan (`enabled: false`) and
// logixlysia (all sinks disabled) are true floors.
```

evlog 2.29.0 does have `initLogger({ enabled: false })`, but it is process-wide (`node_modules/evlog/dist/audit-*.mjs` keeps it in a global `state.enabled`), so it would also silence the other evlog suites in the same run.

- `packages/bench/index.bench.ts:376` (false mechanism): ``// `logToFile` is fire-and-forget from `log()` (`.catch(() => {})`), so this``. The real call is `settle(logToFile({...}))` in `packages/logixlysia/src/logger/emit.ts`.
- `apps/elysia/src/routers/index.ts:69-71` inside `logging.wrapWs('/ws', { ... })`:

```ts
      close() {
        /* wrapWs logs close automatically */
      },
```

`close` is optional in `WsHandlerHooks` (`packages/logixlysia/src/websocket/wrap-ws.ts`), and the wrapper logs the close itself.

- `apps/elysia/src/routers/auto-redact.ts:17-24`:

```ts
/** 4111111111111111 (Luhn-valid) via char codes — avoids literal known-test-PAN in source. */
const mockCreditCard = () =>
  [
    0x34, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31,
    0x31, 0x31, 0x31, 0x31
  ]
    .map(c => String.fromCodePoint(c))
    .join('')
```

- `packages/video/src/lib/fonts.tsx:28-35`:

```ts
try {
  await Promise.all(loads)
} catch {
  // A font that fails to load falls back; render anyway.
}
continueRender(handle)
```

- `packages/video/src/scenes/act4-outro.tsx:22` declares `const EXIT_RISE_PX = 8`, and `:61-62` reads:

```ts
// Enter rises 30px; the exit lifts only 8px so it reads softer than the enter.
const y = (1 - s) * 30 - (1 - out) * EXIT_RISE_PX
```

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

- `bunfig.toml`, `oxfmt.config.ts`
- `packages/bench/index.bench.ts`
- `apps/elysia/demo.tape`, `apps/elysia/src/routers/index.ts`, `status.ts`, `auto-redact.ts`
- `packages/video/src/lib/fonts.tsx`, `theme.ts`, `ui.tsx`, `packages/video/src/scenes/*.tsx`

**Out of scope** (do NOT touch):

- Anything under `packages/logixlysia/` (no changeset is needed for this plan).
- `packages/logixlysia/bunfig.toml` and `bunup.config.ts`: their comments explain a coverage exclusion and two verified bunup workarounds (dropping `sourceBase` nests the build under `dist/src/`, checked at `b2a8244`).
- `.github/workflows/**`: their comments explain CI decisions (the release split, permissions, the VHS pin).
- Benchmark methodology comments (`BENCH_BASELINE`, `RUN_OPTIONS`, the noop-transport rationale) and the VHS `Wait` and timing notes in `demo.tape`, including the deliberate `/chekout` typo note.

## Git workflow

- Branch: `improve/062-prune-tooling-playground-video-comments`, created in Step 0 from `b2a8244`.
- One commit per step that says **Commit**, with the exact subject given. Conventional Commits, as in `git log` (e.g. `fix(logger): log the status the client actually got`).
- Never add a `Co-Authored-By` trailer, a "Generated with" line, or any other attribution to a commit message. This overrides any default you have.
- Stage files by path (`git add <path> ...`). Never `git add -A` or `git add .`, and never stage `AGENTS.md`.
- Do NOT push or open a PR. The reviewer does that.

## Steps

### Step 0: Set up

1. `git switch -c improve/062-prune-tooling-playground-video-comments`. If that branch already exists, STOP.
2. `bun install --frozen-lockfile` → exit 0.
3. `jq -r .version node_modules/elysia/package.json` → `1.4.30`. Any other version means the install is wrong: STOP.
4. Baseline gates: `bun run lint` → exit 0; `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`. If any fails before you changed anything, STOP.
5. `git checkout -- AGENTS.md`, then `git status --short` → empty.

### Step 1: Delete the comments listed in Appendix B

A script deletes exact line ranges so none is mistyped. It refuses to write anything if a range does not start with the expected text or is not a whole comment.

1. `mkdir -p /tmp/prune-062`. Save Appendix A verbatim as `/tmp/prune-062/prune-comments.ts` and Appendix B verbatim (only the lines inside the code fence) as `/tmp/prune-062/spec.txt`.
2. From the worktree root: `bun /tmp/prune-062/prune-comments.ts /tmp/prune-062/spec.txt --dry-run` → last line `dry run ok`. Any `MISMATCH` line means the file drifted from `b2a8244`: STOP and report it.
3. `bun /tmp/prune-062/prune-comments.ts /tmp/prune-062/spec.txt` → `removed 62 comment lines across 12 files`.
4. `bun run format` → exit 0. It folds a now-empty multi-line body such as `() => {\n}` into `() => {}`.
5. `bun run lint` → exit 0. `bun run typecheck` → exit 0. Tests → `703 pass`, `0 fail`.
6. `git checkout -- AGENTS.md`. `git status --short` lists only files that appear in Appendix B.
7. **Commit**: `chore: drop comments that restate the code in tooling, the playground and the video`

**Verify**: `git show --stat HEAD` → 12 files. `git show HEAD | grep '^+' | grep -v '^+++'` prints only lines the formatter re-folded (no new words).

### Step 2: Correct two benchmark claims

In `packages/bench/index.bench.ts`, replace the four lines quoted under "Current state" with:

```ts
// evlog can only be switched off process-wide (`initLogger({ enabled: false })`),
// which would also silence the other evlog suites, so its "floor" case
// (evlogApp) still assembles and drains a wide event per request and is not a
// pure dispatch floor. bogeychan (`enabled: false`) and logixlysia (all sinks
// disabled) are true floors.
```

and in the file-sink suite comment replace ``(`.catch(() => {})`)`` with ``(through `settle()`)``.

**Verify**: `bun run lint` → exit 0.

**Commit**: `chore(bench): correct two claims about evlog and the file sink`

### Step 3: Simplify two playground spots

1. `apps/elysia/src/routers/index.ts`: delete the three-line `close() { /* wrapWs logs close automatically */ },` member from the hooks object passed to `logging.wrapWs('/ws', ...)`.
2. `apps/elysia/src/routers/auto-redact.ts`: replace the doc line and `mockCreditCard` (quoted under "Current state") with:

```ts
const mockCreditCard = (): string => `4${'1'.repeat(15)}`
```

**Verify**: `bun -e "console.log(\`4\${'1'.repeat(15)}\`)"`prints the same 16 digits the char codes encode.`bun run typecheck`→ exit 0.`bun run lint` → exit 0.

**Commit**: `refactor(playground): drop the empty close hook and build the test card number plainly`

### Step 4: Simplify two video spots

1. `packages/video/src/lib/fonts.tsx`: replace the `try { await Promise.all(loads) } catch { ... }` block with `await Promise.allSettled(loads)`, keeping `continueRender(handle)` after it.
2. `packages/video/src/scenes/act4-outro.tsx`: add `const ENTER_RISE_PX = 30` directly above `const EXIT_RISE_PX = 8`, delete the comment `// Enter rises 30px; the exit lifts only 8px so it reads softer than the enter.`, and change the line under it to `const y = (1 - s) * ENTER_RISE_PX - (1 - out) * EXIT_RISE_PX`.

**Verify**: `bun run typecheck` → exit 0. `bun run lint` → exit 0.

**Commit**: `refactor(video): settle font loads without an empty catch and name the outro rise`

### Step 5: Final gates

1. `bun run lint` → exit 0.
2. `bun run typecheck` → exit 0.
3. `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`.
4. `bun run build` → exit 0.
5. `git checkout -- AGENTS.md`; `git status --short` → empty.
6. `git log --format=%B b2a8244..HEAD | grep -ciE 'co-authored-by|generated with'` → `0`.
7. `git diff b2a8244..HEAD | grep -c '^+.*oxlint-disable'` → `0`.

## Test plan

- No package code changes. Gates: lint, typecheck (covers `apps/elysia` and `packages/video`), the package test suite (unchanged, 703) and the full build.

## Done criteria

ALL must hold:

- [ ] `bun run lint`, `bun run typecheck` and `bun run build` exit 0
- [ ] `cd packages/logixlysia && bun test` → `703 pass`, `0 fail`
- [ ] `git diff --name-only b2a8244..HEAD` lists only files from the Scope section
- [ ] No commit message contains `Co-Authored-By` or `Generated with`
- [ ] No `oxlint-disable` comment was added
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you and maintains the index)
- [ ] `git diff --name-only b2a8244..HEAD | grep -c '^packages/logixlysia/'` → `0`

## STOP conditions

Stop and report back (do not improvise) if:

- A `MISMATCH` from the dry run, or a "before" excerpt in a manual step that you cannot find verbatim (the code drifted since `b2a8244`).
- A verification fails twice after a reasonable fix attempt.
- A step would need a file outside the Scope section, or a lint rule turned off.
- Elysia resolves to anything other than `1.4.30` after the install.

## Maintenance notes

- `demo.tape` is also the CI smoke test (`.github/workflows/terminal-recording.yml`); its `Wait` lines are assertions. Only comments were removed.

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
bunfig.toml|2|2|# Linker is used to link the dependencies to the
oxfmt.config.ts|4|5|// Keeps the style the repo had under Biome, so
packages/bench/index.bench.ts|40|41|// Cases stay in the order given, so logixlysia
packages/bench/index.bench.ts|118|118|// Initialize loggers with output disabled for f
apps/elysia/src/routers/status.ts|23|23|// e.g. "Not Found" — exercises string statuses
apps/elysia/demo.tape|1|6|# Logixlysia — recorded terminal demo of the pla
apps/elysia/demo.tape|11|15|#
apps/elysia/demo.tape|61|61|# A plain 200: level, service tag, method, path,
apps/elysia/demo.tape|77|77|# autoRedact scrubs the card, e-mail, IP and JWT
apps/elysia/demo.tape|84|84|# 4xx degrades the line to WARNING.
apps/elysia/demo.tape|91|91|# A thrown handler error becomes a red ERROR lin
apps/elysia/demo.tape|98|98|# AI metrics ride along on the request line.
packages/video/src/scenes/act1-scatter.tsx|5|9|/**
packages/video/src/scenes/act1-scatter.tsx|150|150|/** The field the wipe reveals and Act 2 opens o
packages/video/src/scenes/act1-scatter.tsx|166|166|// A slow push-in keeps the paper alive between
packages/video/src/scenes/act2-noise.tsx|12|16|/**
packages/video/src/scenes/act2-noise.tsx|43|43|/** The hot field the wipe reveals and Act 3 ope
packages/video/src/scenes/act3-reveal.tsx|22|27|/**
packages/video/src/scenes/act3-reveal.tsx|66|66|// Rings keep expanding slowly after they land,
packages/video/src/scenes/act4-outro.tsx|12|15|/**
packages/video/src/scenes/act4-outro.tsx|126|126|// The outro is split into four chunks that land
packages/video/src/lib/ui.tsx|15|15|/** 0..1 progress of `frame` across `[start, end
packages/video/src/lib/ui.tsx|28|28|/** Off-white paper with a faint square grid, li
packages/video/src/lib/ui.tsx|47|47|/** Film grain: a static turbulence texture at l
packages/video/src/lib/ui.tsx|109|112|/**
packages/video/src/lib/ui.tsx|187|187|/** Frosted glass panel used for chat bubbles, c
packages/video/src/lib/ui.tsx|205|205|// A shadow ring reads on any backdrop; a solid
packages/video/src/lib/ui.tsx|273|273|/** Typewriter: returns the prefix of `text` vis
packages/video/src/lib/fonts.tsx|37|37|/** Injects the bundled fonts and holds the rend
packages/video/src/lib/fonts.tsx|39|39|// Created once, on first render, like a `useSta
packages/video/src/lib/theme.ts|7|7|/** The fox orange from the icon; the one accent
packages/video/src/lib/theme.ts|10|10|/** Shadow-as-border rings (surfaces.md): a 1px
```
