# Plan 091: `mergeContext` merges nested objects instead of replacing them

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report. A reviewer dispatched you and maintains `plans/README.md`, so do not edit the index.
>
> **Drift check (run first)**: `git diff --stat 0873da0..HEAD -- packages/logixlysia/src/context/request-context.ts packages/logixlysia/src/types/logger.ts apps/docs/content/features/request-context.mdx`. If a file changed, compare the excerpts below with the live code; a mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (a deliberate nested overwrite becomes a union)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `0873da0`, 2026-11-06

## Why this matters

A request's context is built up across middleware and service layers. Today `log.mergeContext({ user: { id } })` followed by `log.mergeContext({ user: { plan } })` loses `id`, because only top-level keys merge. Each layer has to know what earlier layers wrote. After this plan the two calls produce `{ user: { id, plan } }`, and the same rule applies to the per-line context of `log.info('x', { user: { seat } })`.

## Current state

`packages/logixlysia/src/context/request-context.ts`:

```ts
mergeContext(key, partial) {
  if (Object.keys(partial).length === 0) {
    return
  }
  const bag = getOrCreate(key)
  for (const [field, value] of Object.entries(partial)) {
    Object.defineProperty(bag, field, {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    })
  }
},
```

and in `mergeLogDataContext`:

```ts
const mergedContext = {
  ...accumulated,
  ...(hasExplicit ? (explicit as Record<string, unknown>) : {})
}
```

`defineProperty` is deliberate: a `__proto__` key must become an own property, never set the prototype.

`packages/logixlysia/src/types/logger.ts`, `RequestScopedLogger<TFields>`:

```ts
debug: (message: string, context?: Partial<TFields>) => void
error: (message: string, context?: Partial<TFields>) => void
info: (message: string, context?: Partial<TFields>) => void
mergeContext: (partial: Partial<TFields>) => void
warn: (message: string, context?: Partial<TFields>) => void
```

`Partial` rejects `{ user: { id } }` when `user` needs more fields (measured TS2741). `__tests__/types/typed-fields.test.ts` is the exemplar for type tests. No existing test pins replacing a nested object. `src/ai.ts` `mergeAIMetrics` re-sends a whole `ai` object, so it is unaffected.

## Commands you will need

| Purpose   | Command                                               | Expected |
| --------- | ----------------------------------------------------- | -------- |
| Install   | `bun install --frozen-lockfile`                       | exit 0   |
| Lint      | `bun run lint`                                        | exit 0   |
| Format    | `bun run format`                                      | exit 0   |
| Typecheck | `bun run typecheck`                                   | exit 0   |
| Tests     | `cd packages/logixlysia && bun run build && bun test` | all pass |

## Scope

**In scope**: `packages/logixlysia/src/context/request-context.ts`, `src/types/logger.ts`, `__tests__/context/request-context.test.ts`, `__tests__/types/typed-fields.test.ts`, `apps/docs/content/features/request-context.mdx`, `.changeset/deep-merge-context.md` (create).

**Out of scope**: merging arrays, a config flag to keep the old behaviour, `Logger.mergeContext`'s signature (it stays `Record<string, unknown>`, and it reaches the same store), and `AGENTS.md` (turbo appends a block to it; run `git checkout -- AGENTS.md` before committing and stage by path).

## Git workflow

Branch `improve/091-deep-merge-context` from the worktree HEAD. Conventional commits with no attribution trailer, e.g. `feat(context): merge nested objects in mergeContext`. Do not push.

## Steps

### Step 1: The merge rule

In `request-context.ts`, add:

```ts
const MAX_MERGE_DEPTH = 8

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const defineField = (
  target: Record<string, unknown>,
  field: string,
  value: unknown
): void => {
  Object.defineProperty(target, field, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

const mergeValue = (previous: unknown, next: unknown, depth: number): unknown =>
  depth < MAX_MERGE_DEPTH && isPlainObject(previous) && isPlainObject(next)
    ? mergeFields(previous, next, depth + 1)
    : next

const mergeFields = (
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
  depth: number
): Record<string, unknown> => {
  const merged: Record<string, unknown> = {}
  for (const field of Object.keys(base)) {
    defineField(merged, field, base[field])
  }
  for (const field of Object.keys(incoming)) {
    const previous = Object.hasOwn(base, field) ? base[field] : undefined
    defineField(merged, field, mergeValue(previous, incoming[field], depth))
  }
  return merged
}
```

Reorder if the linter wants a definition first. In `mergeContext`, the loop becomes:

```ts
const previous = Object.hasOwn(bag, field) ? bag[field] : undefined
defineField(bag, field, mergeValue(previous, value, 0))
```

In `mergeLogDataContext`, replace the spread with `hasExplicit ? mergeFields(accumulated, explicit as Record<string, unknown>, 0) : { ...accumulated }`.

The rule, for tests and docs:

| Value | Behaviour |
| --- | --- |
| Plain and null-prototype objects on both sides | Merge into a fresh object; the caller's objects stay untouched |
| Arrays, `Date`, class instances, `null`, primitives | Replace |
| Nested `__proto__` or `constructor` key | Own property; `Object.prototype` is unchanged |
| Cycles | Depth cap of 8, then replace; no `RangeError` |

**Verify**: `cd packages/logixlysia && bun test __tests__/context` passes.

### Step 2: Types

In `types/logger.ts`, add and export:

```ts
/** `Partial` at every depth. Arrays, dates and functions stay whole, since they replace rather than merge. */
export type DeepPartial<T> = T extends
  | readonly unknown[]
  | Date
  | ((...args: never[]) => unknown)
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T
```

Use `DeepPartial<TFields>` in all five `RequestScopedLogger` members. Update the doc comment's example if it no longer holds. If `src/interfaces.ts` lists the exports of `types/logger`, add `DeepPartial` there, and to the type list in `src/index.ts` if the same list appears; `__tests__/types/root-type-exports.test.ts` shows how exports are gated.

**Verify**: `bun run typecheck` exits 0.

### Step 3: Tests

In `__tests__/context/request-context.test.ts` add one test per table row, plus: two nested merges produce the union; the caller's objects are not mutated; `mergeLogDataContext` merges a per-line nested field over the accumulated one, and leaves the store unchanged; three levels of nesting merge. The `__proto__` case parses `JSON.parse('{"__proto__":{"polluted":true}}')` and asserts `({}).polluted === undefined`, nested under a key as well as at the top. The cycle case builds `a.self = a` and merges it twice without throwing.

In `__tests__/types/typed-fields.test.ts` add: `{ user: { id: 'a' } }` compiles for `{ user: { id: string; plan: string } }`; `// @ts-expect-error` on `{ user: { idd: 'a' } }`; `// @ts-expect-error` on `{ tags: [1] }` for `tags: string[]`.

Add one plugin-level test: a handler calls `log.mergeContext` twice and `log.info('x', { user: { seat: 2 } })`, and the capture transport's `meta.context.user` holds all three fields. Put it in `__tests__/context/request-context.test.ts`.

**Verify**: the tests pass and `bun run typecheck` exits 0.

### Step 4: Docs and changeset

In `features/request-context.mdx`, add a short section with the rule table. Create `.changeset/deep-merge-context.md` with `'logixlysia': minor`. It must say plainly: `mergeContext` and per-line context now merge nested plain objects, so a nested overwrite that relied on replacing the whole object now keeps the old keys; assign `null` or an array to replace.

**Verify**: `bun run format`, then `bun run lint` exits 0.

## Test plan

Step 3. Existing suites stay green.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0.
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the new tests.
- [ ] `git status` shows only in-scope files, plus `interfaces.ts`/`index.ts` if Step 2 needed them; `AGENTS.md` is unchanged.

## STOP conditions

- `DeepPartial` breaks typing of an Elysia context anywhere (`bun run typecheck` errors outside the in-scope files) and a small change to the type does not fix it.
- An existing test relies on replacing a nested object.

## Maintenance notes

`peekContext` hands internal readers the live bag, so nested values must never be mutated in place; `mergeFields` always builds fresh objects for that reason. A reviewer should check the `Object.hasOwn` read, which keeps `constructor` from resolving to an inherited function.
