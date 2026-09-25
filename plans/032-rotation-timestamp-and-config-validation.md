# Plan 032: Make gzip failures non-fatal to retention, honour `SYS:`/`UTC:` timestamp prefixes, and validate thresholds and `maxFiles`

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5522d31..HEAD -- packages/logixlysia/src/output/rotation-manager.ts packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/src/config/resolve-options.ts packages/logixlysia/src/utils/rotation.ts packages/logixlysia/__tests__/output packages/logixlysia/__tests__/logger packages/logixlysia/__tests__/config packages/logixlysia/__tests__/utils/rotation.test.ts` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5522d31`, 2026-09-19

## Why this matters

Three small, verified defects:

1. **A failing gzip skips retention.** `compressFile` reports the error and rethrows; `performRotation` awaits it unguarded, so the `maxFiles` cleanup that follows never runs. With `logRotation: { compress: true, maxFiles: 7 }`, a disk-full or EACCES on the `.gz` target means the directory accumulates uncompressed rotated files without bound, which is the scenario `maxFiles` exists to prevent. The same error is then reported a second time by the file sink's catch.
2. **`timestamp.translateTime: 'SYS:standard'` renders literally.** The console formatter substitutes only the `yyyy/mm/dd/HH/MM/ss/SSS` tokens; pino-pretty's `SYS:` and `UTC:` prefixes (which the same config value is forwarded to) print as text, and `SYS:standard` produces no timestamp at all.
3. **Two config values are accepted but broken.** `slowThreshold > verySlowThreshold` paints a request green while badging it slow. A numeric `maxFiles` of `0` or a negative number passes validation and deletes rotated files it should keep.

## Current state

`rotation-manager.ts` (`compressFile` 62–88, `performRotation` 168–194):

```ts
  } catch (error) {
    reportRotationError(`[logixlysia] Failed to compress file ${filePath}:`, error, onError)
    throw error
  } finally {
    release()
  }
...
  const shouldCompress = config.compress === true
  if (shouldCompress) {
    const algo = config.compression ?? 'gzip'
    if (algo === 'gzip') {
      await compressFile(rotated, onError)
    }
  }

  if (config.maxFiles !== undefined) {
    const retention = parseRetention(config.maxFiles)
    await cleanupRotated(filePath, retention, onError)
  }
```

`file-sink.ts:163–175` — `maybeRotate` wraps `performRotation` in a `try/catch` that calls `options.onRotationError(error)` or `console.error`; so a rethrow from `compressFile` is reported twice.

`create-logger.ts:36–57` — `formatTimestamp(date, pattern?)`: returns ISO when no pattern; otherwise `pattern.replaceAll('yyyy', …)` etc. using local getters. `logger/index.ts:76–82` forwards the same `config.timestamp.translateTime` to pino-pretty, which understands `SYS:standard`, `SYS:<pattern>`, `UTC:<pattern>`, and treats a bare pattern as UTC.

`resolve-options.ts` — `validateLogRotation` (6–36) calls `parseRetention(logRotation.maxFiles)` for validation; `validateSampling` (51–…) uses helpers `isPercentage`, `isNonNegativeNumber`; `resolveOptions` (≈184–200) calls both validators then returns. No validation of `slowThreshold`/`verySlowThreshold`. Error message convention: `` `logixlysia: invalid <area> config — <detail>` ``.

`utils/rotation.ts:65–72`:

```ts
export const parseRetention = (
  value: number | string
): { type: 'count' | 'time'; value: number } => {
  if (typeof value === 'number') {
    return { type: 'count', value }
  }
  return { type: 'time', value: parseInterval(value) }
}
```

`create-logger.ts:95–113` — `colorDurationText(ms, useColors, slow, verySlow)`: `isVerySlow = ms >= verySlow`; colour branches `ms < slow` green, `ms < verySlow` yellow, else red.

Tests to model after: `__tests__/output/rotation-manager.test.ts`, `__tests__/logger/create-logger.test.ts` (has a `translateTime: 'yyyy-mm-dd HH:MM:ss'` case around lines 335–362), `__tests__/config/resolve-options.test.ts`, `__tests__/utils/rotation.test.ts`. Temp dirs via `__tests__/_helpers/tmp.ts`.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Typecheck / Lint / Format | `bun run typecheck` / `bun run lint` / `bun run format` | exit 0 |
| Targeted | `cd packages/logixlysia && bun test __tests__/output __tests__/logger __tests__/config __tests__/utils/rotation.test.ts` | all pass |
| Full | `cd packages/logixlysia && bun test` | all pass |

## Scope

**In scope**: `src/output/rotation-manager.ts`, `src/logger/create-logger.ts` (`formatTimestamp` only), `src/config/resolve-options.ts`, `src/utils/rotation.ts` (`parseRetention` only), `src/types/config.ts` (doc comments for `translateTime`, `slowThreshold`, `maxFiles` only), the four test files above, `apps/docs/content/configuration.mdx` (timestamp section: document the prefixes), `.changeset/rotation-timestamp-validation.md`.

**Out of scope**: `file-sink.ts`, pino-pretty wiring in `logger/index.ts`, the colour helpers beyond reading them.

## Git workflow

- Branch: `improve/032-rotation-timestamp-validation` off `main`.
- Commits: `fix(rotation): keep retention running when compression fails`, `fix(logger): honor SYS: and UTC: timestamp prefixes`, `fix(config): reject inverted slow thresholds and non-positive maxFiles`.
- Changeset `.changeset/rotation-timestamp-validation.md`:

  ```markdown
  ---
  'logixlysia': patch
  ---

  A failed gzip during rotation no longer skips `maxFiles` cleanup and is reported once. `timestamp.translateTime` understands pino-pretty's `SYS:standard`, `SYS:<pattern>` and `UTC:<pattern>` forms on the console line. `resolveOptions` now rejects `slowThreshold` greater than `verySlowThreshold` and a numeric `logRotation.maxFiles` that is not a positive integer.
  ```

- Do NOT push or open a PR.

## Steps

### Step 1: Non-fatal compression

In `performRotation`, wrap the `compressFile` call: `try { await compressFile(rotated, onError) } catch { /* already reported inside compressFile */ }`, so cleanup always runs. Keep `compressFile`'s own report and rethrow (other callers may rely on the throw), but make sure the rotation path reports once: since `performRotation` now swallows, the file sink's catch no longer sees it. Add a comment explaining the single-report contract.

**Verify**: `rotation-manager.test.ts` new test `'retention cleanup still runs when compression fails'`: create a temp log dir with 3 rotated files, make compression fail (e.g. `mock.module('node:zlib')`? simpler: create the rotated file's `.gz` target as a _directory_ so `writeFile` fails with EISDIR), call `performRotation(path, { compress: true, maxFiles: 1 }, onError)`; assert `onError` called exactly once and only one rotated file remains.

### Step 2: Timestamp prefixes

In `formatTimestamp`: detect a `SYS:` or `UTC:` prefix (case-insensitive). `SYS:` uses local getters (current behaviour), `UTC:` uses the `getUTC*` getters, and a bare pattern keeps today's local behaviour (do not change it to UTC; it is documented as local). The keyword `standard` (after either prefix) expands to `yyyy-mm-dd HH:MM:ss.SSS` (pino-pretty's definition minus the `o` timezone offset token, which this formatter does not support). Implement with a small `resolveTimestampPattern(pattern): { pattern: string; utc: boolean }` helper.

**Verify**: `create-logger.test.ts` new cases: `'SYS:standard'` renders `\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}`; `'UTC:HH:MM'` renders the UTC hour for a fixed `setSystemTime` date; the existing unprefixed test stays green.

### Step 3: Validation

- `parseRetention`: for numbers, require `Number.isInteger(value) && value > 0`, else throw `new Error(\`maxFiles must be a positive integer, got ${value}\`)`(it is wrapped by`validateLogRotation` into the standard message).
- `resolve-options.ts`: add `validateFormatting(config)`: if either threshold is defined it must be a finite non-negative number; if both are defined, `slowThreshold <= verySlowThreshold`, else throw `` `logixlysia: invalid formatting config — slowThreshold (${slow}) must not exceed verySlowThreshold (${verySlow})` ``. Call it from `resolveOptions` after `validateSampling`.
- Update the `@default`/doc comments in `types/config.ts` for `slowThreshold`, `verySlowThreshold`, `maxFiles`, `translateTime`.

**Verify**: `resolve-options.test.ts`: `slowThreshold: 1000, verySlowThreshold: 500` throws; `slowThreshold: 500, verySlowThreshold: 1000` passes; `maxFiles: 0` and `maxFiles: -1` throw; `maxFiles: 3` and `maxFiles: '7d'` pass. `rotation.test.ts`: `parseRetention(2.5)` throws.

### Step 4: Docs, changeset, format, gate

`configuration.mdx` timestamp section: list the three accepted forms. Changeset. `bun run format && bun run lint && bun run typecheck && cd packages/logixlysia && bun test`.

## Done criteria

- [ ] `grep -n "try {" -A2 packages/logixlysia/src/output/rotation-manager.ts | grep -c compressFile` → 1 (the guarded call)
- [ ] `grep -n "UTC:" packages/logixlysia/src/logger/create-logger.ts` → match
- [ ] `grep -n "validateFormatting" packages/logixlysia/src/config/resolve-options.ts` → definition and call
- [ ] `cd packages/logixlysia && bun test` exits 0 with ≥ 8 new tests; `bun run lint`, `bun run typecheck` exit 0
- [ ] `.changeset/rotation-timestamp-validation.md` exists

## STOP conditions

- The excerpts no longer match.
- An existing test asserts that `SYS:` renders literally, or that `maxFiles: 0` is accepted (report before changing).
- Making compression non-fatal breaks `__tests__/output/rotation-manager.test.ts` for a reason other than the double-report count.
