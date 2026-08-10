# Spike 021: Decide the fate of `logRotation.interval`

**Status:** Decided (recommendation for maintainer sign-off)
**Date:** 2026-08-10
**Commit stamp:** evidence gathered at `origin/main` = `30869f4`

## Summary

`logRotation.interval` is a documented, typed, changelog-claimed feature that
does nothing at runtime. `resolveOptions` validates its *format* but nothing
reads the value to trigger rotation. Recommendation: **implement lazily**,
integrated into `FileSinkImpl` (file-sink.ts), sourced from the `birthtime`
already returned by the `stat()` call the sink makes on every file open — no
new timers, no new syscalls on the hot path. See Decision section.

## Evidence

### Where `interval` is promised

**Type definition** — `packages/logixlysia/src/types/config.ts:12-27`
(`LogRotationConfig`), lines 15-18:

```
/**
 * Rotate at a fixed interval, e.g. '1d', '12h'.
 */
interval?: string
```

Note: this doc comment example (`'12h'`) doesn't even match the actual
validator regex, `INTERVAL_REGEX = /^(\d+)(h|d|w)$/i` in
`packages/logixlysia/src/utils/rotation.ts:5` — `'12h'` matches fine, but the
comment's neighbor in the docs site (`'1m'`/minutes) would not. Minor,
recorded for the docs follow-up.

**Format validation (no semantics)** —
`packages/logixlysia/src/config/resolve-options.ts:19-21`:

```ts
if (logRotation.interval !== undefined) {
  parseInterval(logRotation.interval)
}
```

This throws on a malformed string (e.g. `'2x'`) but the parsed value is
discarded — nothing stores or acts on it.

**Explicit non-implementation comment** —
`packages/logixlysia/src/output/rotation-manager.ts:189-193` (end of
`performRotation`):

```
// `config.interval` (fixed-interval rotation, e.g. '1d'/'12h') is not
// implemented here: rotation is currently only triggered by `maxSize`
// (see `FileSinkImpl.maybeRotate` in file-sink.ts).
```

This is the clearest first-party admission that the feature is a no-op.
`FileSinkImpl.maybeRotate` (`packages/logixlysia/src/output/file-sink.ts:117-146`)
confirms it: it only reads `rotation.maxSize`, never `rotation.interval`.

**CHANGELOG claims** — `packages/logixlysia/CHANGELOG.md:166-167`:

```
- **log-rotation:** implement complete rotation with interval support ([673b800]…)
- **log-rotation:** implement complete rotation with interval support ([9016a51]…), closes #138
```

Both entries claim "complete rotation with interval support," dated under
the `5.3.0` release section. The second closes issue #138 (see below) — but
#138 was a *typing* bug, not a runtime-semantics request, so "closes #138"
is technically true while the CHANGELOG's "implement complete rotation with
interval support" wording overstates what shipped.

**Docs** — `apps/docs/content/features/log-rotation.mdx` promises interval
rotation in (at minimum) four places:

- Lines 35-43, "Time-based Rotation" section:
  ```
  logRotation: {
    interval: '1d'    // Rotate daily
  }
  ```
  ```
  Supported intervals: '1h', '1d', '1w' (or any number)
  ```
- Lines 83-85, "How Rotation Works":
  ```
  Rotation occurs automatically when:
  - File size reaches `maxSize`
  - Time interval `interval` has elapsed
  ```
- Lines 91-98, "Production" example config includes `interval: '1d'`.
- Lines 112-118, "High-Volume" example config includes `interval: '1h'`.

None of these are true today.

### Issue #138 (`gh issue view 138`)

- **Title:** "Bug: Interval property is missing from logInterval object"
- **State:** closed
- **Body summary:** reporter said `interval` was "missing from `logRotation`
  object despite it does exist in the docs" — specifically that TypeScript
  **autocomplete did not show the `interval` property**. Expected behavior:
  "Autocomplete must show the `interval` property."
- This is a **typing complaint**, not a runtime-behavior complaint. The fix
  that closed it (commits 673b800/9016a51, "implement complete rotation with
  interval support") appears to have added the `interval?: string` field to
  the type (satisfying autocomplete) and the format validator, without ever
  wiring rotation semantics — which is exactly the gap this spike is about.

### GitHub search signal

```
$ gh search issues --repo PunGrumpy/logixlysia "interval"
PunGrumpy/logixlysia  138  closed  Bug: Interval property is missing from logInterval object  bug  2025-10-10
PunGrumpy/logixlysia  146  closed  Bug: basically does not work.                              bug  2025-12-24

$ gh search issues --repo PunGrumpy/logixlysia "rotation"
PunGrumpy/logixlysia  175  closed  Restructure packages/cli (exports + types + lint) [breaking]  2025-12-21
```

Issue #146 ("basically does not work") does include `interval: "1d"` in its
reproduction config, but its actual complaint (confirmed by reading the full
body via `gh issue view 146 --json body,comments`) is that
`store.pino` doesn't exist when destructured from context — an unrelated
Pino-integration wiring bug, closed by telling the reporter to upgrade.
Issue #175 is a `packages/cli` restructuring PR that surfaced only because
it touches the word "rotation" incidentally in its diff — not a rotation bug
report.

**Interpretation:** zero issues, in either search, complain that interval
rotation silently fails to rotate at runtime. The only "interval" signal is
a typing/autocomplete complaint that was resolved by adding the type — which
is precisely how the type came to exist without semantics. Nobody appears to
have discovered the runtime gap yet (or discovered it and didn't file), which
argues for fixing it now, before adoption grows, rather than waiting for
complaints.

### No timers in the codebase

```
$ grep -rn "setInterval\|setTimeout" packages/logixlysia/src
(no output — NONE FOUND)
```

Confirmed: the codebase currently has zero `setInterval`/`setTimeout` calls
anywhere under `packages/logixlysia/src`. This is a real "no-timers" stance
today, not just an absence of need.

## The three options

### 1. Lazy-on-write

Derive the live file's age from `stat().birthtimeMs` (already fetched at
`ensureOpen` time — see file-sink.ts:112, `const stat = await handle.stat()`)
or from an in-memory `openedAt` timestamp captured at open. On each write, if
`now - birth >= parseInterval(interval)`, rotate before/after the write, the
same way `maybeRotate` already does for `maxSize`.

- **+** No timers, no idle wake-ups, no `unref()` bookkeeping, no lifecycle
  dependency. Drops directly into `FileSinkImpl.maybeRotate`
  (file-sink.ts:117-146), which already owns the write path and already has
  a `stat()` result in hand at open time.
- **+** Survives process restarts correctly using `birthtime` (filesystem
  metadata), unlike a purely in-memory `openedAt` which resets to "now" on
  every restart even if the file is old.
- **−** An **idle process never rotates**: if writes stop, a file can sit
  well past its configured interval — arbitrarily long — until the next
  write arrives, at which point it rotates immediately (likely by more than
  one interval's worth of overdue-ness). **Position: this is an acceptable,
  explicitly documented tradeoff.** `interval` in this design is not a wall-
  clock guarantee ("this file will never be older than 1d"); it's a
  request throttle ("don't grow one file forever if the service is busy").
  A process quiet enough to go a full interval without emitting a single
  log line is not the case anyone is filing size/growth complaints about —
  and it matches the repo's existing size-based semantics, which already
  only ever check on write.

### 2. Timer-based

Per-sink `setInterval(() => tryRotate(), parseInterval(interval))`.

- **+** Rotates on schedule even when idle — closes the gap above.
- **−** Requires `timer.unref()` — **mandatory**, or the plugin keeps every
  Bun/Node process alive indefinitely (a logging library holding a process
  open is a severe, surprising bug class). Node's `unref()` timers can still
  drift/coalesce, and this must be tested, not assumed.
- **−** No lifecycle hook exists yet to clear the timer. `FileSinkImpl` has
  no `close()` (see file-sink.ts:148, `// see plans/020: flush()/close()
  lifecycle would await flushChain here` — the hook comment is aspirational,
  not implemented). Without a close() design (plan 020, not yet landed) a
  per-sink timer has nothing that ever calls `clearInterval`, meaning
  sinks for paths that fall out of use (e.g. per-test temp files, or a
  reconfigured `logFilePath`) leak a live, indefinitely-firing timer for the
  life of the process — a real problem in tests and dev-mode hot reload.
- **−** Serverless-hostile: on Lambda-style freeze/thaw runtimes, an
  `unref()`'d interval either drifts arbitrarily across freezes or never
  fires reliably between invocations — timer-based rotation is unlikely to
  work as documented on any FaaS platform, which is a real deployment target
  the docs don't currently exclude.
- **−** Directly contradicts the repo's current zero-timer codebase (grep
  above) — this would be the first timer in the plugin.

### 3. Remove the option

Delete `interval` from `LogRotationConfig`; `resolveOptions`/
`validateLogRotation` rejects a supplied `interval` with a migration-pointing
error message instead of silently validating-and-discarding it. Docs stop
promising interval rotation; `logRotation` becomes size + retention +
compression only.

- **+** Simplest, most honest fix; zero new runtime surface, zero timer
  risk, zero lifecycle dependency on plan 020.
- **−** Breaking for any config that currently sets `interval` — though,
  per the evidence above, it never did anything, so no *behavior* actually
  regresses; only a type/validation error appears where previously the
  value was silently swallowed. Recommend the standard deprecation path:
  warn (not throw) in a minor release first, remove/throw in the next major.

## Scratch experiment

Question: does `birthtime`/`birthtimeMs` survive appends and renames (the
two operations `FileSinkImpl`/`rotateFile` actually perform), and is it
non-zero, on the filesystems this matters on? Environment: WSL2, kernel
6.18.33.2, root filesystem `ext4` (`/dev/sdd on / type ext4`, confirmed via
`mount`); `/tmp` here is `tmpfs`, so `/var/tmp` (same `ext4` device as `/`)
was used as the disk-backed comparison point. CI (`ubuntu-latest`) is also
`ext4`, so the `/var/tmp` (ext4) run is the representative one; the `tmpfs`
run is recorded for completeness since some CI/test setups do use tmpfs for
scratch dirs.

Runtimes tested: Node v26.7.0 and Bun 1.3.14 (both present in this repo's
toolchain).

Commands run (see raw output below): create a file, `stat`, wait ~1.2s,
append, `stat` again, rename (simulating rotation), `stat` the renamed file,
then write a fresh file at the original path (simulating the sink reopening
after rotation) and `stat` that.

Raw output — `node` against `ext4` (`/var/tmp`):

```
after create: birthtime=2026-08-10T02:35:24.941Z birthtimeMs=1786329324940.6353 mtimeMs=1786329324940.6353
after append: birthtime=2026-08-10T02:35:24.941Z birthtimeMs=1786329324940.6353 mtimeMs=1786329326144.6353 (birthtime unchanged=true)
after rename: birthtime=2026-08-10T02:35:24.941Z birthtimeMs=1786329324940.6353 (survives rename=true)
new file after rotation: birthtimeMs=1786329326147.868 (fresh birth=true)
```

Raw output — same script against `tmpfs` (`/tmp`):

```
after create: birthtime=2026-08-10T02:35:26.185Z birthtimeMs=1786329326184.6353 mtimeMs=1786329326184.6353
after append: birthtime=2026-08-10T02:35:26.185Z birthtimeMs=1786329326184.6353 mtimeMs=1786329327388.635 (birthtime unchanged=true)
after rename: birthtime=2026-08-10T02:35:26.185Z birthtimeMs=1786329326184.6353 (survives rename=true)
new file after rotation: birthtimeMs=1786329327392.0698 (fresh birth=true)
```

Second experiment, replicating the *actual* code path in
`FileSinkImpl.ensureOpen` (`open(path, 'a', mode)` then `handle.stat()`) on
`ext4`, under both runtimes:

```
=== under node ===
open(a) stat: birthtimeMs=1786329339288.6335 mtimeMs=1786329339288.6335 size=0
after write via handle: birthtimeMs=1786329339288.6335 (unchanged=true) mtimeMs=1786329339291.4802

=== under bun ===
open(a) stat: birthtimeMs=1786329339840.6335 mtimeMs=1786329339840.6335 size=0
after write via handle: birthtimeMs=1786329339840.6335 (unchanged=true) mtimeMs=1786329339844.6335
```

Interpretation:

- `birthtimeMs` is **non-zero, stable, and correct** in every combination
  tested (ext4 and tmpfs; node and bun; fresh open, in-place append, and
  rename). No fallback-to-zero case was observed.
- Crucially, `FileSinkImpl.ensureOpen` (file-sink.ts:103-115) **already
  calls `handle.stat()`** on every open, purely to seed `bytesWritten`. That
  same `Stats` object's `birthtimeMs` is free — reading interval-rotation
  age costs **zero additional syscalls** in the common (already-open) case,
  and exactly the one `stat()` the sink already does on (re)open otherwise.
- Caveat for the doc, not disproven here but worth flagging: Linux
  `birthtime` support depends on kernel + filesystem + libc `statx`
  plumbing; older kernels/filesystems (e.g. some network filesystems, or
  ext4 mounted without extended attributes in unusual configurations) can
  report `birthtimeMs === 0` or fall back to `ctime`. This repo's CI
  (`ubuntu-latest`, modern kernel, ext4) is fine per this experiment, but a
  production implementation should treat `birthtimeMs === 0` (or absent) as
  "unknown" and fall back to an in-memory `openedAt` captured at
  `ensureOpen` time, rather than trusting the filesystem unconditionally.

## Decision

**Recommendation: Option 1, lazy-on-write.**

Rationale:

- **No user signal justifies the timer's extra complexity.** GitHub search
  found zero complaints about interval rotation not firing at runtime —
  the only "interval" issue (#138) was a typing gap, already closed by
  adding the type without semantics. There is no evidence anyone needs
  rotation to fire while the process is idle.
- **The idle-process gap is an acceptable, explainable tradeoff**, and it's
  consistent with how `maxSize` rotation already behaves (check-on-write,
  not check-continuously) — implementing `interval` the same way keeps the
  mental model of `logRotation` uniform: "checked whenever a log line is
  written," full stop, for both triggers.
- **The repo has zero timers today** (verified by grep) and a stated
  design pressure toward not holding processes alive
  (`onError`/rotation/error paths are already resilient-by-design, not
  timer-driven). Introducing the first timer in the codebase to solve a
  problem nobody has reported, while also depending on the not-yet-landed
  close()-lifecycle spike (020) for cleanup, is the wrong sequencing.
- **Cost is effectively free**: the experiment shows `birthtimeMs` is
  already available from the `stat()` call `ensureOpen` performs today; no
  new syscall, no new dependency, no new failure mode beyond what
  `maxSize`-rotation already has.
- Removal (option 3) was seriously considered — it's the most "honest"
  minimal fix — but lazy-on-write is roughly the same implementation cost
  as writing the removal's deprecation/validation-rejection path, and it
  actually delivers the feature that's already typed, documented, and
  changelog-claimed, rather than retracting it. Implement, don't retreat.

### Source of truth: `birthtime`, with `openedAt` fallback

Based on the experiment: use `stat.birthtimeMs` from the `Stats` object
`ensureOpen` already fetches, as the primary source of truth (it's free and
survives restarts correctly — an in-memory-only `openedAt` would wrongly
reset the interval clock on every process restart, which is a worse
correctness gap than the idle-process one it fixes). Guard with a fallback:
if `birthtimeMs` is `0`/falsy (the flagged Linux edge case above), fall back
to an in-memory `openedAt = Date.now()` captured at the same `ensureOpen`
call — with the caveat that the fallback loses the "survives restart"
property.

## Follow-up sketch (for the implementation PR)

**Files touched:**

- `packages/logixlysia/src/output/file-sink.ts`
  - `ensureOpen`: capture `openedAt = stat.birthtimeMs || Date.now()`
    alongside the existing `bytesWritten = stat.size` assignment.
  - `maybeRotate`: after the existing `maxSize` check, add an `interval`
    check — `if (rotation.interval !== undefined) { const intervalMs =
    parseInterval(rotation.interval); if (Date.now() - this.openedAt >=
    intervalMs) { /* same rotate-and-reset-handle path as maxSize */ } }`.
    Both triggers should share the same rotate-and-clear-handle code path
    (currently duplicated inline for `maxSize`; worth extracting a small
    `rotateNow()` helper while touching this).
  - Reset `openedAt` alongside `bytesWritten = 0` whenever the handle is
    cleared for rotation or reopened.
- `packages/logixlysia/src/output/rotation-manager.ts`
  - Delete the "not implemented here" comment (rotation-manager.ts:189-193)
    — replace with a short note that interval-triggering lives in
    `FileSinkImpl.maybeRotate`, `performRotation` itself doesn't need to
    change (it already rotates+compresses+cleans-up regardless of *why*
    rotation was triggered).
- `packages/logixlysia/src/config/resolve-options.ts`
  - No change needed; `parseInterval` format validation already exists
    (resolve-options.ts:19-21).

**Test list:**

- Unit: `FileSinkImpl` rotates when `Date.now() - openedAt >= parseInterval(interval)`
  on the next write (mock/advance time, or use a very small interval like
  `'0h'`-adjacent test helper — whatever pattern the existing `maxSize`
  rotation tests use).
- Unit: a write *before* the interval elapses does **not** rotate.
- Unit: `interval` and `maxSize` both configured — whichever threshold is
  crossed first triggers rotation (test both orderings).
- Unit: process-restart simulation — construct a fresh `FileSinkImpl` for a
  path whose on-disk file already has an old `birthtime` (e.g. via
  `utimes`/pre-seeded file) and assert the very next write rotates
  immediately, proving the restart hole is closed by using `birthtime`
  rather than a fresh in-memory clock.
- Unit: `birthtimeMs === 0` fallback path — mock `stat()` to return
  `birthtimeMs: 0` and assert the sink falls back to `openedAt = Date.now()`
  without throwing.
- Integration: idle-process case — explicitly assert (and comment why) a
  sink with no writes for longer than `interval` does **not** rotate until
  the next write arrives; this documents the accepted tradeoff as a test,
  not just prose.
- No new test should assert `setInterval`/timer behavior — this
  implementation intentionally adds none.

**Docs impact (for plan 019):**

- `apps/docs/content/features/log-rotation.mdx`:
  - "Time-based Rotation" (lines 35-43): keep the section, but add an
    explicit callout: rotation is evaluated **on the next write after the
    interval elapses**, not on a fixed wall-clock schedule — an idle
    process's file may exceed `interval` in age until traffic resumes.
  - "How Rotation Works" (lines 83-85): keep the "Time interval `interval`
    has elapsed" bullet, but add the same on-write-only caveat immediately
    below it.
  - "Production"/"High-Volume" examples (lines 91-98, 112-118): keep as-is
    — these become truthful once the implementation lands.
  - Also fix the "Supported intervals: `'1h'`, `'1d'`, `'1w'` (or any
    number)" line (line 43) — "(or any number)" is inaccurate; the actual
    format is `INTERVAL_REGEX = /^(\d+)(h|d|w)$/i` in
    `packages/logixlysia/src/utils/rotation.ts:5` (a required numeric
    amount plus a required `h`/`d`/`w` unit; no bare number, no minutes).
- Direction for plan 019: **do not soften or hedge these sections** — once
  021's recommendation lands, `interval` will genuinely work; the only
  wording addition needed is the on-write-evaluation caveat plus the format
  fix, not a rewrite disclaiming the feature.

**CHANGELOG correction wording** (dated correction note, appended near the
top of `packages/logixlysia/CHANGELOG.md`, not rewriting the 5.3.0 history):

```
### Correction (2026-08-10)

The 5.3.0 entries "log-rotation: implement complete rotation with interval
support" (673b800, 9016a51) added the `interval` config field and its
format validation, but did not wire it to actually trigger rotation —
`interval` was a no-op until the fix landed in [PR reference, once merged].
See plans/spikes/021-interval-rotation-decision.md for the investigation.
```

## Open questions for the maintainer

1. Should the interval-vs-maxSize "whichever fires first" behavior be
   configurable (e.g. "only interval," "only size"), or is "either trigger
   rotates" always correct? This spike assumes the latter (matches the
   docs' "Rotation occurs automatically when: File size reaches `maxSize` OR
   Time interval has elapsed" wording) but it's worth an explicit yes.
2. Is the idle-process gap (file can exceed `interval` in age until the next
   write) acceptable to ship without a companion timer-based "strict" mode
   later, or should this spike's doc callout instead steer users with a
   true idle-rotation need toward an external `logrotate`/cron solution
   rather than ever adding a timer to this plugin?
