# Plan 147: With `autoRedact` on, `store.pino` masks the same keys as the plugin's own lines

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. Skip any instruction to update `plans/README.md`: the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/src/logger/index.ts packages/logixlysia/src/utils/redact.ts packages/logixlysia/__tests__/utils/redact.test.ts packages/logixlysia/__tests__/logger/pino-auto-redact.test.ts apps/docs/content/configuration.mdx` This plan runs after plan 141 has merged, so the drift check will list `src/logger/index.ts` (141 changes the `prettyStream` function and the `./create-logger` import) and `configuration.mdx` (141 changes the `timestamp` section). Plans 144 and 148 of the same pass may also have changed `src/logger/index.ts` (`PluginLogger` and `finalizeRequest`) and `configuration.mdx` (the `logErrorPayload` section). Those changes are expected. Only the excerpts in "Current state" of the lines this plan touches must match the live code, by content: line numbers in `src/logger/index.ts` after line 76 may have moved by a few lines. A mismatch in one of those excerpts, or any change to `src/utils/redact.ts` or `__tests__/utils/redact.test.ts`, is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/141-translate-time-on-pretty-pino-lines.md (merge it first; this plan does not touch its lines)
- **Category**: security
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

With `autoRedact: true` (also turned on by `preset: 'prod'`), the plugin masks a key on its own lines by a rule: camelCase, snake_case and kebab-case spellings all match, any key ending in `token`, any key ending in `api-key`, `access-key`, `private-key` or `signing-key`, any key with a `password`, `passwd`, `secret`, `jwt` or `authorization` part, plus every `redactKeys` name, at any depth. The docs page says `x_api_key` and `xApiKey` match. `store.pino` gets none of that rule. It gets pino `redact` paths built from the literal spellings in `DEFAULT_REDACT_KEYS` plus `redactKeys`, at the top level and one level down only. So the same object, logged through `store.pino` in a background job (which the FAQ recommends), writes credentials in clear text.

Measured at `c019a4f` on Bun 1.3.14, with `createLogger({ config: { autoRedact: true, pino: { base: null, timestamp: false } } })` and a capturing pino destination, values are fake:

| Logged through `store.pino` | Written today | Written after this plan |
| --- | --- | --- |
| `{ password: 'FAKE_A' }` | `"password":"[REDACTED]"` | `"password":"[REDACTED]"` |
| `{ accessToken, access_token, apiKey, x_api_key, Authorization, refreshToken, clientSecret, jwt, stripeSecretKey }` | every value in clear text (`"accessToken":"FAKE_B"`, …) | every value `"[REDACTED]"` |
| `{ user: { profile: { password: 'FAKE_L' } } }` | `"password":"FAKE_L"` | `"password":"[REDACTED]"` |
| `error` with `config.headers.Authorization` | `"Authorization":"FAKE_EH"` | `"Authorization":"[REDACTED]"` |
| `{ headers: new Headers({ authorization, accept }) }` | `"headers":"[unable to serialize, circular reference is too complex to analyze]"` | `"headers":{"accept":"x","authorization":"[REDACTED]"}` |
| `child({ accessToken: 'FAKE_CB' }).info('child')` | `"accessToken":"FAKE_CB"` | `"accessToken":"[REDACTED]"` |
| `{ note: 'mail a@b.test from 10.0.0.1' }` | unchanged | unchanged (value patterns still do not run here) |

The same holds with `pino.prettyPrint` on and with a `pino.transport`. With `transport: { target: 'pino/file', … }` and with `transport.targets` holding two `pino/file` targets, the file today holds `"accessToken":"FAKE_T1"` and `"password":"FAKE_T2"` under `user.profile`; after the fix both are `"[REDACTED]"`.

After this plan, every key the plugin's own lines mask is masked on `store.pino` too, in the logged object, in a logged error's own properties, in `Headers`, in child-logger bindings and in `pino.base`. Values are still not scanned by value pattern on `store.pino`, as the docs say. A user's own `pino.redact` still replaces the automatic masking, as the docs say. The masked value stays `[REDACTED]`. Users see more values masked than before; that is the documented behaviour, and the `Headers` line stops printing an error string instead of the headers.

## Current state

All source paths are relative to `packages/logixlysia/`.

### How `store.pino` is built

`src/logger/index.ts:17`:

```ts
import { buildPinoRedactPaths } from '../utils/redact'
```

`src/logger/index.ts:25-26`, the first statements after the imports:

```ts
const ZERO_STORE: StoreData = { beforeTime: 0n }
const NO_CONTEXT: Readonly<Record<string, unknown>> = Object.freeze({})
```

`src/logger/index.ts:62-74`, inside `createLazyPino`. `pinoOptions` is `config.pino` without `errorKey`, `messageKey` and `prettyPrint`:

```ts
const basePinoOptions = {
  ...pinoOptions,
  ...outputKeys,
  level: pinoOptions.level ?? 'info',
  ...(config?.autoRedact === true && pinoOptions.redact === undefined
    ? {
        redact: {
          censor: '[REDACTED]',
          paths: buildPinoRedactPaths(config?.redactKeys)
        }
      }
    : {})
}
```

`src/logger/index.ts:84-97` (plan 141 does not change these lines, but they sit below its change and may have moved down):

```ts
let realPino: Pino | undefined

const getPino = (): Pino => {
  if (!realPino) {
    const factory = pinoFactory ?? loadPino()
    realPino = shouldPrettyPrint
      ? factory(basePinoOptions, prettyStream())
      : factory({
          ...basePinoOptions,
          transport: pinoOptions.transport
        })
  }
  return realPino
}
```

Do not touch `prettyStream` (lines 76-82 at `c019a4f`; plan 141 rewrites it).

### The key rule and the paths

`src/utils/redact.ts:50-53`:

```ts
export interface RedactRules {
  keys?: readonly string[]
  patterns?: readonly RegExp[]
}
```

`RedactRules` is internal: it is not exported from the package root and is not in `dist/*.d.ts`.

`src/utils/redact.ts:134-153` is `isSensitiveKey(key, extraKeys)`, the key rule every other sink uses. `src/utils/redact.ts:155-167` is the path builder this plan removes:

```ts
/** pino redact paths for every default and extra key: top-level and one nesting level. */
export const buildPinoRedactPaths = (
  extraKeys?: readonly string[]
): string[] => {
  const keys = [...DEFAULT_REDACT_KEYS, ...(extraKeys ?? [])]
  return keys.flatMap(key => {
    // pino paths don't allow `-` in bare identifiers; bracket-quote them.
    if (key.includes('-')) {
      return [`["${key}"]`, `*["${key}"]`]
    }
    return [key, `*.${key}`]
  })
}
```

Its only callers are `src/logger/index.ts:70` and the test at `__tests__/utils/redact.test.ts:634-641`.

### The walker the plugin's own lines use

`redact(value, rules)` (`src/utils/redact.ts:856-857`) walks a value with the `walker` object (`src/utils/redact.ts:589-854`). For each own key of a plain object it calls `isSensitiveKey(key, rules?.keys)` and writes `'[REDACTED]'` (the constant `REDACTED_TEXT`, line 46) for a sensitive key. It also handles `Error` (copies the error with its prototype and masks its own properties by key), values with `toJSON` (walks what `toJSON` returns), `Map`, `Set`, `Headers` and `URLSearchParams` (by name), `URL` (query names), cycles (`'[Circular]'`) and depth (`'[Depth]'` past 64 levels). An object, array or error is copied only when something in it changes.

Every string it meets goes through `redactString(text, patterns)` (`src/utils/redact.ts:303-362`), which runs `redactPatterns` and then the built-in value patterns (emails, IPs, cards, JWTs, URL passwords, `Bearer`/`Basic`). That is the part `store.pino` must not get. `redactString` is called with `rules?.patterns` from exactly 12 places in the file, each of the form `redactString(<text>, rules?.patterns)`, at lines 373, 388, 404, 435, 438, 482, 509, 542, 613, 631, 775 and 877. For example line 613:

```ts
const redactedMessage = redactString(originalError.message, rules?.patterns)
```

and line 775, in `walker.value`:

```ts
if (typeof value === 'string') {
  return redactString(value, rules?.patterns)
}
```

`grep -c "redactString(" src/utils/redact.ts` prints `12` at `c019a4f`.

### pino 10.4.0 behaviour this plan relies on (checked in `node_modules/pino`)

- `formatters.log` is called once per log call on the merging object, after `mixin` and before serializers and before pino's own `redact` (`lib/tools.js:161-163`). What it returns is what pino writes.
- `formatters.bindings` is called for `base` when the logger is built. `child()` always replaces it with an identity function for the child (`lib/proto.js:97-104`, `lib/proto.js:137-149`), so a child's bindings reach no formatter. They are serialized once, when the child is made.
- A child is `Object.create(parent)` (`lib/proto.js:91`), so a method set on the root instance is inherited by every child and grandchild.
- With `transport` or `transport.targets`, pino forbids only a custom `formatters.level` (it throws `option.transport.targets do not allow custom level formatters`, `lib/tools.js:341-342`). `formatters.log` and `formatters.bindings` are allowed, and they run in the main thread before the line goes to the transport worker. This plan adds no `formatters.level`.
- A `pino.redact` with no `censor` writes `[Redacted]` (pino's default), not `[REDACTED]`.

### Tests and conventions

- `__tests__/logger/pino-keys.test.ts` is the pattern for driving real pino through `createLogger` with a capturing factory: `createLogger({ config }, capturingFactory(lines))`, then `JSON.parse` each line. Match it.
- `__tests__/utils/redact.test.ts:1-9` imports `buildPinoRedactPaths, isSensitiveKey, redact, redactRequest, redactString` from `../../src/utils/redact`. Lines 634-641:

  ```ts
  describe('buildPinoRedactPaths', () => {
    test('includes bare and nested paths for simple keys, bracket-quoted for hyphenated keys', () => {
      const paths = buildPinoRedactPaths()
      expect(paths).toContain('password')
      expect(paths).toContain('*.password')
      expect(paths).toContain('["x-api-key"]')
    })
  })
  ```

- `__tests__/logger/create-logger.test.ts:11-21` replaces the cached `pino-pretty` module with a stub for the whole test process. A test that writes through the real pino-pretty therefore fails in the full suite (`TypeError: stream.write is not a function`), though it passes alone. The tests below never write through pino-pretty for that reason.
- Functions are `const` arrow functions with explicit parameter and return types, except where `this` is needed. Comments say why, never what. Tests use `bun:test`, assert literal values, and use obviously fake secrets.

### Docs

`apps/docs/content/configuration.mdx:82-104` is the `autoRedact` section. Line 97 is its last paragraph before the type list:

```mdx
Value-pattern redaction is best-effort — it only catches values matching those specific shapes. Always prefer key-based redaction (`redactKeys`) for known sensitive fields instead of relying on their value happening to match a pattern. For free-text PII that has no fixed shape — names, street addresses, phone numbers, national IDs — see [neural PII redaction](/docs/integrations/desertant), which runs an on-device model over records on their way to a transport.

- **Type:** `boolean`
```

### What the fix costs per call

Counted, not timed. Under `autoRedact` with no `pino.redact`, each `store.pino` log call adds one `redact()` walk of the merging object:

- One `WeakSet` per call, and one add and one delete on it per container (object, array, error, `Map`, `Set`, `toJSON` value) reached, down to 64 levels.
- One `isSensitiveKey` call per own key of each plain object. For a key of 64 characters or less seen before, that is one `Map` lookup. With a non-empty `redactKeys`, a key that is not sensitive by default also costs one `normalizeKeyName` of the key and one per `redactKeys` entry (the same work the plugin's own lines do).
- No regular expression runs on any string value.
- Copies: none when no key is sensitive and the object holds no error, `Map`, `Set`, `Headers`, `URL`, `URLSearchParams` or `toJSON` value. A sensitive key at depth `d` makes `d + 1` shallow copies (the object holding it and each ancestor). Each error, `Map`, `Set`, `Headers`, `URL` and `URLSearchParams` is rebuilt once, and its ancestors are copied. A `toJSON` value has `toJSON` called once by the walk instead of once by pino.
- Child bindings are walked once per `child()` call, `base` once when pino is built, not per line.
- Removed: pino no longer gets `redact`, so its per-call path redaction stops. Today that runs a wildcard stringifier on every top-level value of every line (48 default paths plus two per `redactKeys` entry).

## Commands you will need

Run lint and format from the worktree root. Run the rest from the directory shown.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (root) | exit 0 |
| Build | `cd packages/logixlysia && bun run build` | `Build completed` |
| Lint | `bun run lint` (root) | exit 0 |
| Format | `bun run format` (root) | exit 0; read the diff it makes |
| Typecheck | `cd packages/logixlysia && bun run typecheck` | exit 0 |
| Two test files | `cd packages/logixlysia && bun test ./__tests__/logger/pino-auto-redact.test.ts ./__tests__/utils/redact.test.ts` | judge by pass and fail counts (exit is 1 on a subset) |
| Full suite | `cd packages/logixlysia && bun test` | 0 fail |
| Docs typecheck | `cd apps/docs && bun run typecheck` | exit 0 |

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/utils/redact.ts`
- `packages/logixlysia/src/logger/index.ts` (the import on line 17, two new functions above `ZERO_STORE`, `basePinoOptions`, `getPino`; nothing else)
- `packages/logixlysia/__tests__/logger/pino-auto-redact.test.ts` (create)
- `packages/logixlysia/__tests__/utils/redact.test.ts` (the import and the `buildPinoRedactPaths` block only)
- `apps/docs/content/configuration.mdx` (the `autoRedact` section only)
- `.changeset/store-pino-key-masking.md` (create)

**Out of scope** (do NOT touch):

- `prettyStream` in `src/logger/index.ts`. Plan 141 owns it.
- `PluginLogger` and `finalizeRequest` in `src/logger/index.ts`. Plan 144 may be changing them.
- `redactString`, `isSensitiveKey`, `DEFAULT_REDACT_KEYS` and what the plugin's own lines print. The plugin's lines must not change; the full suite pins them.
- Running value patterns or `redactPatterns` on `store.pino` lines. The docs say they do not run there, and that stays true.
- `src/logger/emit.ts`, which calls `redact` for the plugin's own lines. It never sets the new field.
- The docs pages `faq.mdx` and `integrations/pino.mdx`, and the `redactPatterns` and `pino.redact` sections of `configuration.mdx`. Other pull requests are editing them.
- `src/types/config.ts`. No new option, export or dependency.
- `packages/logixlysia/src/adapters/shared.ts`, `src/ai.ts`, `src/axiom.ts`, `src/better-stack.ts`, `src/desertant.ts`, `src/output/index.ts`, `src/output/shutdown.ts`, `src/extensions/banner.ts`, `src/utils/report.ts`, the `flushLogixlysia` and `onStop` parts of `src/index.ts`, `__tests__/adapters/shared.test.ts`. Another session owns them.

## Git workflow

- Branch: `fix/store-pino-key-masking`, cut from `main` after plan 141 has merged.
- Four commits, in this order:
  1. `refactor(redact): let redact mask by key name only` (`src/utils/redact.ts` without the `buildPinoRedactPaths` removal, and the new `redact with keysOnly` test in `__tests__/utils/redact.test.ts`)
  2. `fix(pino): mask store.pino keys by the rule the plugin's own lines use` (`src/logger/index.ts`, the `buildPinoRedactPaths` removal from `src/utils/redact.ts` and its test, and `__tests__/logger/pino-auto-redact.test.ts`)
  3. `docs(configuration): say what autoRedact masks on store.pino`
  4. `chore(changeset): note the store.pino key masking fix`
- Each commit body is one to three short paragraphs of plain prose: what was wrong for a user, what the change does, what a reader would not guess from the diff (for commit 2: why child bindings need the `child` wrapper).
- Stage files by name. Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Write the failing tests

Create `packages/logixlysia/__tests__/logger/pino-auto-redact.test.ts` with exactly this content:

```ts
import { describe, expect, test } from 'bun:test'
import pino from 'pino'
import type { Options } from '../../src/interfaces'
import { createLogger } from '../../src/logger'

const MASK = '[REDACTED]'

type Config = NonNullable<Options['config']>

const capturingFactory = (lines: string[]): typeof pino =>
  ((opts: pino.LoggerOptions) =>
    pino(opts, {
      write: (line: string) => {
        lines.push(line)
      }
    })) as unknown as typeof pino

/** A logger whose `store.pino` writes bare JSON lines into `lines`. */
const redactingPino = (lines: string[], config: Config = {}) =>
  createLogger(
    {
      config: {
        autoRedact: true,
        ...config,
        pino: { base: null, timestamp: false, ...config.pino }
      }
    },
    capturingFactory(lines)
  ).pino

const parsed = (lines: string[]): Record<string, unknown>[] =>
  lines.map(line => JSON.parse(line) as Record<string, unknown>)

describe('store.pino under autoRedact', () => {
  test('masks every key the plugin masks, at any depth', () => {
    const lines: string[] = []
    redactingPino(lines).info(
      {
        Authorization: 'fake-1',
        accessToken: 'fake-2',
        access_token: 'fake-3',
        apiKey: 'fake-4',
        clientSecret: 'fake-5',
        jwt: 'fake-6',
        password: 'fake-7',
        refreshToken: 'fake-8',
        stripeSecretKey: 'fake-9',
        user: { profile: { password: 'fake-10' } },
        x_api_key: 'fake-11'
      },
      'job done'
    )
    expect(parsed(lines)).toEqual([
      {
        Authorization: MASK,
        accessToken: MASK,
        access_token: MASK,
        apiKey: MASK,
        clientSecret: MASK,
        jwt: MASK,
        level: 30,
        msg: 'job done',
        password: MASK,
        refreshToken: MASK,
        stripeSecretKey: MASK,
        user: { profile: { password: MASK } },
        x_api_key: MASK
      }
    ])
  })

  test('keeps values no key rule covers, even ones a value pattern would mask', () => {
    const lines: string[] = []
    redactingPino(lines).info({
      cacheKey: 'k1',
      maxTokens: 5,
      note: 'mail a@b.test from 10.0.0.1'
    })
    expect(parsed(lines)).toEqual([
      {
        cacheKey: 'k1',
        level: 30,
        maxTokens: 5,
        note: 'mail a@b.test from 10.0.0.1'
      }
    ])
  })

  test('masks a redactKeys name in any spelling, at any depth', () => {
    const lines: string[] = []
    redactingPino(lines, { redactKeys: ['customerSsn'] }).info({
      order: { billing: { customer_ssn: 'fake-1' } }
    })
    expect(parsed(lines)).toEqual([
      { level: 30, order: { billing: { customer_ssn: MASK } } }
    ])
  })

  test('masks the bindings of a child and a grandchild', () => {
    const lines: string[] = []
    redactingPino(lines)
      .child({ accessToken: 'fake-1', tenant: 'acme' })
      .child({ clientSecret: 'fake-2' })
      .info({ refreshToken: 'fake-3' }, 'nested')
    expect(parsed(lines)).toEqual([
      {
        accessToken: MASK,
        clientSecret: MASK,
        level: 30,
        msg: 'nested',
        refreshToken: MASK,
        tenant: 'acme'
      }
    ])
  })

  test('masks keys in pino.base', () => {
    const lines: string[] = []
    redactingPino(lines, {
      pino: { base: { apiKey: 'fake-1', service: 'api' } }
    }).info('up')
    expect(parsed(lines)).toEqual([
      { apiKey: MASK, level: 30, msg: 'up', service: 'api' }
    ])
  })

  test('masks the own properties of a logged error and keeps its message', () => {
    const lines: string[] = []
    const error = Object.assign(new Error('boom'), {
      config: { headers: { Authorization: 'fake-1' } }
    })
    redactingPino(lines).error(error)
    const [line] = parsed(lines)
    expect(line?.msg).toBe('boom')
    expect(line?.err).toMatchObject({
      config: { headers: { Authorization: MASK } },
      message: 'boom',
      type: 'Error'
    })
  })

  test('masks a Headers value by header name', () => {
    const lines: string[] = []
    redactingPino(lines).info({
      headers: new Headers({ accept: 'text/plain', authorization: 'fake-1' })
    })
    expect(parsed(lines)).toEqual([
      { headers: { accept: 'text/plain', authorization: MASK }, level: 30 }
    ])
  })

  test('masks what a user formatters.log returns', () => {
    const lines: string[] = []
    redactingPino(lines, {
      pino: { formatters: { log: object => ({ ...object, apiKey: 'fake-1' }) } }
    }).info({ id: 7 })
    expect(parsed(lines)).toEqual([{ apiKey: MASK, id: 7, level: 30 }])
  })

  test('a user pino.redact replaces the automatic masking', () => {
    const lines: string[] = []
    redactingPino(lines, { pino: { redact: ['password'] } }).info({
      accessToken: 'fake-1',
      password: 'fake-2'
    })
    expect(parsed(lines)).toEqual([
      { accessToken: 'fake-1', level: 30, password: '[Redacted]' }
    ])
  })

  test('masks nothing without autoRedact', () => {
    const lines: string[] = []
    redactingPino(lines, { autoRedact: false }).info({ password: 'fake-1' })
    expect(parsed(lines)).toEqual([{ level: 30, password: 'fake-1' }])
  })

  test('masks lines when prettyPrint is on', () => {
    const lines: string[] = []
    redactingPino(lines, { pino: { prettyPrint: true } }).info({
      accessToken: 'fake-1'
    })
    expect(parsed(lines)).toEqual([{ accessToken: MASK, level: 30 }])
  })

  test('gives a pino transport the masking formatter', () => {
    let options: pino.LoggerOptions | undefined
    const factory = ((opts: pino.LoggerOptions) => {
      options = opts
      return {}
    }) as unknown as typeof pino
    const transport = { target: 'pino/file' }
    createLogger({ config: { autoRedact: true, pino: { transport } } }, factory)
    expect(options?.transport).toEqual(transport)
    expect(options?.formatters?.log?.({ accessToken: 'fake-1' })).toEqual({
      accessToken: MASK
    })
  })
})
```

Why the last two tests look as they do: with `prettyPrint: true` the logger calls the factory with the options and a pino-pretty stream; `capturingFactory` ignores the stream and writes JSON with those same options, so the test reads what the options mask without going through pino-pretty (which another test file stubs for the whole process). A real transport runs in a worker thread, so the transport test checks the options pino receives instead; `'[Redacted]'` in the `pino.redact` test is pino's own default censor.

In `packages/logixlysia/__tests__/utils/redact.test.ts`, directly above the line `describe('buildPinoRedactPaths', () => {` (line 634), add this block and leave the `buildPinoRedactPaths` block in place for now:

```ts
describe('redact with keysOnly', () => {
  test('masks by key and header name and keeps every string as written', () => {
    const out = redact(
      {
        error: new Error('mail a@b.test'),
        headers: new Headers({ authorization: 'fake-1', from: 'a@b.test' }),
        note: 'from 10.0.0.1',
        password: 'fake-2'
      },
      { keysOnly: true }
    ) as {
      error: Error
      headers: Headers
      note: string
      password: string
    }
    expect(out.password).toBe('[REDACTED]')
    expect(out.note).toBe('from 10.0.0.1')
    expect(out.error.message).toBe('mail a@b.test')
    expect(out.headers.get('authorization')).toBe('[REDACTED]')
    expect(out.headers.get('from')).toBe('a@b.test')
  })
})
```

`bun run typecheck` fails at this step (`keysOnly` is not yet a field of `RedactRules`); `bun test` runs the file anyway.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/logger/pino-auto-redact.test.ts` reports 3 pass and 9 fail. The three that pass are `keeps values no key rule covers, even ones a value pattern would mask`, `a user pino.redact replaces the automatic masking` and `masks nothing without autoRedact`. The failure of `masks a Headers value by header name` shows `+     "headers": "[unable to serialize, circular reference is too complex to analyze]",`. Then `bun test ./__tests__/utils/redact.test.ts` reports 104 pass and 1 fail, the failure being `Expected: "from 10.0.0.1"` / `Received: "from [REDACTED]"`. Keep both outputs for your report.

### Step 2: Give `redact` a keys-only mode

In `src/utils/redact.ts`:

1. Add the field to `RedactRules`:

   ```ts
   export interface RedactRules {
     keys?: readonly string[]
     /** Mask by key and header name only; strings are kept as written. */
     keysOnly?: boolean
     patterns?: readonly RegExp[]
   }
   ```

2. Directly after the end of `redactString` (the `}` that closes it, just before the `/**` comment that starts `The host cannot hold`), add:

   ```ts
   // `store.pino` lines get key masking only: the docs promise that value
   // patterns do not run on them.
   const redactText = (text: string, rules?: RedactRules): string =>
     rules?.keysOnly === true ? text : redactString(text, rules?.patterns)
   ```

3. Replace each of the 12 calls `redactString(<text>, rules?.patterns)` listed in "Current state" with `redactText(<text>, rules)`, keeping `<text>` as written. Change nothing else on those lines. In keys-only mode this keeps every string, error message, stack, header value, path segment, host and hash as written, and still masks by name: object keys, header names, `URLSearchParams` and URL query names, and a `URL` object's password field.

**Verify**: `grep -c "redactString(" src/utils/redact.ts` prints `1` (the call inside `redactText`). `grep -c "rules?.patterns" src/utils/redact.ts` prints `1`. `bun test ./__tests__/utils/redact.test.ts` reports 105 pass and 0 fail. `bun test ./__tests__/logger/pino-auto-redact.test.ts` still reports 3 pass and 9 fail. `bun run typecheck` exits 0.

Commit 1 now (`src/utils/redact.ts`, `__tests__/utils/redact.test.ts`).

### Step 3: Mask `store.pino` with the walker

In `src/logger/index.ts`:

1. Replace line 17 with:

   ```ts
   import { redact } from '../utils/redact'
   import type { RedactRules } from '../utils/redact'
   ```

2. Directly above `const ZERO_STORE: StoreData = { beforeTime: 0n }`, add:

   ```ts
   type PinoFormatters = NonNullable<pino.LoggerOptions['formatters']>

   // A user's formatter runs first, so a key it adds is masked too. `bindings`
   // reaches only `base`: pino swaps it out for every child.
   const maskingFormatters = (
     formatters: PinoFormatters | undefined,
     rules: RedactRules
   ): PinoFormatters => ({
     ...formatters,
     bindings: bindings =>
       redact(
         formatters?.bindings ? formatters.bindings(bindings) : bindings,
         rules
       ),
     log: object =>
       redact(formatters?.log ? formatters.log(object) : object, rules)
   })

   // pino writes a child's bindings when the child is made and no formatter sees
   // them. Children inherit this method from the root, so grandchildren too.
   const maskChildBindings = (root: Pino, rules: RedactRules): void => {
     const { child } = root
     root.child = function maskedChild(this: Pino, bindings, options) {
       return child.call(this, redact(bindings, rules), options)
     } as Pino['child']
   }
   ```

   `maskedChild` is a `function` expression on purpose: pino calls `child` with `this` set to the logger the child is made from, and an arrow function would lose it. `...formatters` keeps a user's `formatters.level`.

3. Directly above `const basePinoOptions = {`, add:

   ```ts
   const keyRules: RedactRules | undefined =
     config?.autoRedact === true && pinoOptions.redact === undefined
       ? { keys: config.redactKeys, keysOnly: true }
       : undefined
   ```

   and replace the conditional spread at the end of `basePinoOptions` (the `...(config?.autoRedact === true && pinoOptions.redact === undefined ? { redact: { … } } : {})` excerpt in "Current state") with:

   ```ts
       ...(keyRules === undefined
         ? {}
         : { formatters: maskingFormatters(pinoOptions.formatters, keyRules) })
   ```

4. In `getPino`, right after the `realPino = shouldPrettyPrint ? … : factory({ … })` assignment and before the closing `}` of `if (!realPino)`, add:

   ```ts
   if (keyRules !== undefined) {
     maskChildBindings(realPino, keyRules)
   }
   ```

5. In `src/utils/redact.ts`, delete `buildPinoRedactPaths` with its doc comment (the whole excerpt in "Current state"). In `__tests__/utils/redact.test.ts`, delete the `describe('buildPinoRedactPaths', …)` block (the excerpt in "Current state") and remove `buildPinoRedactPaths,` from the import at the top.

**Verify**: `grep -rn "buildPinoRedactPaths" packages/logixlysia/src packages/logixlysia/__tests__` (from the root) prints nothing. `cd packages/logixlysia && bun test ./__tests__/logger/pino-auto-redact.test.ts ./__tests__/utils/redact.test.ts` reports 116 pass and 0 fail. `bun run typecheck` exits 0.

### Step 4: Gates and commit 2

Run `bun run format` at the root and read its diff (it should only rewrap lines you wrote), then `bun run lint` (exit 0). Then `cd packages/logixlysia && bun run build && bun test`.

**Verify**: the full suite reports 0 fail. The test count is 12 higher than on your base and the file count 1 higher. The API snapshot test passes unchanged (`buildPinoRedactPaths` and `RedactRules` are not package exports). If the only failures are child-process tests that time out (`lazy pino`, `bundled app`), rerun the suite once before treating them as real.

Commit 2 now (`src/logger/index.ts`, `src/utils/redact.ts`, `__tests__/utils/redact.test.ts`, `__tests__/logger/pino-auto-redact.test.ts`).

### Step 5: Docs

In `apps/docs/content/configuration.mdx`, in the `autoRedact` section, add one paragraph after the paragraph that starts `Value-pattern redaction is best-effort` and before the line that starts `- **Type:**`. It says, in the page's voice and without a code sample:

- With `autoRedact` on, `store.pino` masks by key name with the same rule as point 1, including `redactKeys`, at any depth: in objects and errors you log, `Headers` values, child-logger bindings and `pino.base`. The value becomes `[REDACTED]`.
- Value patterns and `redactPatterns` do not run on `store.pino` lines.
- Setting `pino.redact` turns this off and uses your paths instead.

Do not add links with guessed anchors. Change nothing else on the page.

**Verify**: `bun run format` then `bun run lint` (root) exit 0. `cd apps/docs && bun run typecheck` exits 0. `git diff -- apps/docs/content/configuration.mdx` shows one added paragraph inside the `autoRedact` section and nothing else.

Commit 3 now.

### Step 6: Changeset

Create `.changeset/store-pino-key-masking.md`:

```md
---
'logixlysia': patch
---

<one short paragraph for a user of the package>
```

Patch, because this fixes documented behaviour that masked less than it said. The paragraph says, in your own plain words: with `autoRedact` on and no `pino.redact`, `store.pino` now masks the same keys as the plugin's own lines (every spelling, `…Token`, `…ApiKey`, `jwt`, `authorization`, and `redactKeys`) at any depth, including logged errors, `Headers`, child-logger bindings and `pino.base`. Before, only the exact built-in spellings at the top level and one level down were masked, so keys such as `accessToken`, `apiKey`, `x_api_key` and a nested `password` were written in clear text, and a `Headers` value printed an error string. Value patterns still do not run on `store.pino`, and a `pino.redact` you set still replaces the automatic masking.

**Verify**: `git status --porcelain` lists only the changeset; commit 4. Afterwards `git status --porcelain` is empty.

## Test plan

- New file `__tests__/logger/pino-auto-redact.test.ts`, 12 tests: 9 fail before the fix, 3 pin behaviour that must not change (values are not scanned, a user `pino.redact` wins, nothing is masked without `autoRedact`).
- `__tests__/utils/redact.test.ts`: one new test for the keys-only mode (fails before Step 2), and the `buildPinoRedactPaths` test removed with the function.
- The rest of the suite pins the plugin's own lines, which must not change.

## Done criteria

ALL must hold:

- [ ] Your report quotes the Step 1 runs, made before any source change: 3 pass and 9 fail, and 104 pass and 1 fail
- [ ] `cd packages/logixlysia && bun test ./__tests__/logger/pino-auto-redact.test.ts ./__tests__/utils/redact.test.ts` reports 116 pass, 0 fail
- [ ] `grep -c "redactString(" packages/logixlysia/src/utils/redact.ts` prints `1`
- [ ] `grep -rn "buildPinoRedactPaths" packages/logixlysia/src packages/logixlysia/__tests__` prints nothing
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0; `cd apps/docs && bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun run build && bun test` reports 0 fail
- [ ] `git diff <base>..HEAD --stat` lists exactly the six in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/src/logger/index.ts` shows no change inside `prettyStream`, `PluginLogger` or `finalizeRequest`
- [ ] `git diff <base>..HEAD -- packages/logixlysia/__tests__/api` is empty

## STOP conditions

Stop and report (do not improvise) if:

- An excerpt in "Current state" for a line this plan touches does not match the code, or `src/utils/redact.ts` or `__tests__/utils/redact.test.ts` changed since `c019a4f`.
- `grep -c "redactString(" src/utils/redact.ts` does not print `12` before Step 2: a call site was added or removed, and the replacement list is wrong.
- A Step 1 test this plan says fails passes before the fix, or one it says passes fails.
- After Step 3 a test outside the two files fails and the failure is about what the plugin's own console, file or transport lines contain. The keys-only mode must not change them.
- pino throws at construction in any test (for example `option.transport.targets do not allow custom level formatters`). This plan adds no level formatter; a throw means the formatter merge is wrong.
- The API snapshot test fails.
- The fix seems to need `src/types/config.ts`, a new export, `emit.ts`, or a docs page other than the `autoRedact` section of `configuration.mdx`.

## Maintenance notes

- The masking runs in `formatters.log`, which pino calls before its serializers. A serializer the user configures for a key now receives the masked copy: an error is a copy with the same prototype (pino's default `err` serializer handles it, as the error test shows), and a value with `toJSON` arrives as what `toJSON` returned. A reviewer should accept this or ask for a follow-up.
- A child made with its own `formatters.log` (`child(bindings, { formatters: { log } })`) replaces the parent's formatter in pino, so its lines are not masked; a child made with its own `redact` keeps today's behaviour for that child. Both are user choices and are left alone.
- `redactKeys` entries are documented as names. An entry written as a pino path (`'user.email'`, `'*.secret'`) used to mask that path on `store.pino` by accident and no longer does.
- The walk goes 64 levels deep while pino prints only to its `depthLimit` (5 by default), so a very deep object is walked further than it is printed.
- If a new branch in `walker` calls `redactString`, it must call `redactText` instead, or `store.pino` lines start getting value patterns.
- Docs left for other pull requests: `configuration.mdx` says in the `redactPatterns` section that `store.pino` "redacts by path" and in the `pino.redact` section that it "replaces the automatic paths"; after this plan it masks by key name. `integrations/pino.mdx` (item 4 of its best-practice list) says `pino.redact` is what masks `store.pino` records and should say that `autoRedact` masks them by key name too.
