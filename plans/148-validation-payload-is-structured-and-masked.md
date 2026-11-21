# Plan 148: With `logErrorPayload`, a failed validation's payload is logged as fields `autoRedact` can mask, never inside the message

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. Skip any instruction to update `plans/README.md`:
> the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/src/utils/error.ts packages/logixlysia/__tests__/errors/validation-shape.test.ts packages/logixlysia/__tests__/logger/handle-http-error.test.ts apps/docs/content/configuration.mdx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

`config.logErrorPayload: true` is documented to log a failed validation's payload as the fields `found` and `errors`. On Elysia 1.4 (the version this repository installs) it does not. Elysia 1.4's `ValidationError` has no `errors` field, so the plugin adds no fields. Instead it logs Elysia's own message, which is a JSON text that contains the whole submitted body. `autoRedact` masks sensitive values by key name, and inside a string there is no key, so a password in the body reaches every sink in clear text even with `autoRedact: true`.

Measured at `c019a4f` on Bun 1.3.14 and Elysia 1.4.30. The app is a `POST /login` with body `t.Object({ email: t.String(), password: t.String({ minLength: 60 }) })`, a fake 18-character password, and `autoRedact: true, logErrorPayload: true`:

| Sink | What it receives today |
| --- | --- |
| transport `message` | `"{\n  \"type\": \"validation\",\n  \"on\": \"body\",\n  \"property\": \"/password\", …` (the password inside `found` and inside `errors[0].value`) |
| transport `meta.error` | `{"code":"VALIDATION","message":"{ … \"found\": { \"email\": \"[REDACTED]\", \"password\": \"<the password>\" } …}","name":"ValidationError","status":422}`, with no `found` field |
| text console line | `WARN  POST    /login 422 4ms { "type": "validation", … "password": "<the password>" …` |
| JSON console line (`consoleFormat: 'json'`) | the same JSON text in `message` and in `error.message` |

The email is masked (a value pattern matches it inside the string). The password is not, because only its key would identify it.

A second leak sits in the list of failures itself. Each entry Elysia 1.4 builds carries the value that failed under the key `value`, and the summary of a wrong-type failure writes it into text: `Expected property 'pin' to be string but found: 4111111`. Copying those entries as they are would leak a password that fails `minLength` under `errors[0].value`, where `autoRedact`'s key rule cannot see it either.

After this plan, with the option on, a failed validation is logged like this, on every sink:

- message: `Validation failed (body): /password` (the same summary already logged when the option is off)
- `error`: `{ errors: [{ message: 'Expected string length greater or equal to 60', path: '/password' }], failedPaths: ['/password'], found: { email: '[REDACTED]', password: '[REDACTED]' }, message: 'Validation failed (body): /password', name: 'ValidationError', type: 'body' }`

This changes output that users with the option on may read today: the message stops being Elysia's JSON text, the data moves to `error.found` and `error.errors`, and `error.code` and `error.status` leave the error object (the record's own `status` stays). It is still right: this is the shape the docs and the type comment have promised, and the old shape cannot be redacted.

## Current state

All source paths are relative to `packages/logixlysia/`.

`src/utils/error.ts` turns any thrown value into the `error` object and message of a log record. Both callers pass `config.logErrorPayload === true` as the second argument: `src/logger/handle-http-error.ts:51-54` (the error line of a failed request) and `src/index.ts:482-485` (`log.error(err)` from a handler). Neither caller needs to change.

`src/utils/error.ts:85-90` reads one field of a failure as text:

```ts
const pathOf = (failure: unknown, key: string): string => {
  if (typeof failure !== 'object' || failure === null || !(key in failure)) {
    return ''
  }
  return String((failure as Record<string, unknown>)[key])
}
```

`src/utils/error.ts:105-114`, `pointerOf`, turns one Elysia 2 failure into a JSON Pointer (its first line calls `pathOf(failure, 'instancePath')`):

```ts
const pointerOf = (failure: unknown): string => {
  const pointer = pathOf(failure, 'instancePath')
  if (pointer || typeof failure !== 'object' || failure === null) {
    return pointer
  }
  const { path } = failure as { path?: unknown }
  return Array.isArray(path) && path.length > 0
    ? `/${path.map(pointerSegment).join('/')}`
    : ''
}
```

`src/utils/error.ts:116-140`:

```ts
/**
 * JSON Pointers to the values that failed. Elysia 1.x gives them as each
 * failure's `path`; 2.x writes a dotted `path` that cannot tell a nested
 * key from one containing a dot, and keeps the pointer on `errors`.
 */
const failedPaths = (error: { all?: unknown[]; errors?: unknown }): string[] =>
  Array.isArray(error.errors)
    ? error.errors.map(pointerOf).filter(Boolean)
    : (Array.isArray(error.all) ? error.all : [])
        .map(failure => pathOf(failure, 'path'))
        .filter(Boolean)

/**
 * Elysia 1.x puts a validation error's payload in its message; 2.x keeps it
 * on the error, so it is copied over only when the payload is wanted.
 */
const addValidationPayload = (
  safe: Record<string, unknown>,
  error: Error
): void => {
  if (isValidationErrorLike(error) && Array.isArray(error.errors)) {
    safe.found = error.value
    safe.errors = error.errors
  }
}
```

`src/utils/error.ts:201-217`, inside `normalizeLoggedError`. The summary is used only when the option is off:

```ts
  if (isValidationErrorLike(error) && !logErrorPayload) {
    const paths = failedPaths(error)
    const scope = typeof error.type === 'string' ? error.type : 'request'
    const message =
      paths.length > 0
        ? `Validation failed (${scope}): ${paths.join(', ')}`
        : `Validation failed (${scope})`
    return {
      error: {
        failedPaths: paths,
        message,
        name: 'ValidationError',
        type: scope
      },
      message
    }
  }
```

With the option on, a validation error falls through to the generic branch at `src/utils/error.ts:219-242`, which copies `error.message` (line 223), calls `addValidationPayload(safe, error)` (line 237), and returns `message: parseError(error)` (line 240), which is `error.message` again.

`isValidationErrorLike` (`src/utils/error.ts:64-83`) recognises Elysia's error on both lines and its type already declares `all?: unknown[]`, `errors?: unknown`, `type?: string` and `value?: unknown`. Do not change it.

What Elysia 1.4.30 gives (`node_modules/elysia/dist/error.mjs`):

- The constructor (lines 211-236) writes `found: value` (the whole submitted value) and the full failure list into the JSON text of `message`, then sets `this.type`, `this.validator`, `this.value`, `this.expected`, `this.code = "VALIDATION"`, `this.status = 422`. It sets no `errors` field.
- The getter `all` (from line 247) re-runs the validator and returns the failures. For TypeBox each entry has the keys `summary, type, schema, path, value, message, errors`, where `path` is a JSON Pointer such as `/password` and `value` is the value that failed. For a Standard Schema validator (Zod) each entry is `{ summary, path, message, value }`, where `value` is the whole submitted body and `path` is dotted, such as `password`.
- `mapValueError` (line 52) builds `summary`. For a wrong-type string failure (TypeBox error type 54) it is `Expected property '<name>' to be string but found: <value>`.

Elysia 2 cannot be installed here. What the package already assumes about it is pinned in `__tests__/errors/validation-shape.test.ts:18-43`: the error has `code: 'validation'`, an `errors` array whose entries carry an `instancePath` pointer or a Standard Schema `path` array of keys, and the submitted value on `value`. CI runs the full suite against Elysia `next` and `rc` (`.github/workflows/validate.yml`, job `elysia-2`).

What else of the error reaches a sink with the option on, checked at `c019a4f`: the generic branch copies only `code`, `fix`, `internal`, `link`, `message`, `name`, `status`, `why`, `stack` and `cause` (`STRUCTURED_ERROR_KEYS`, lines 142-151, and lines 219-241). Elysia's `validator`, `expected`, `value` and `type` are not copied. The stack is not copied because the error's `status` is 422 (line 232-236), and Elysia's `cause` is unset. So the message and the failure entries are the only two places the value leaks. This plan closes both.

Tests that pin today's behaviour, in `__tests__/errors/validation-shape.test.ts`:

- Lines 8-16, the Elysia 1.x fixture:

  ```ts
  // Elysia 1.x: a JSON Pointer per failure in `all`, the payload in the message.
  const elysia1Error = (): Error =>
    Object.assign(new Error(JSON.stringify({ found: body })), {
      all: [{ message: 'too short', path: '/password' }],
      code: 'VALIDATION',
      name: 'ValidationError',
      type: 'body',
      value: body
    })
  ```

- Lines 71-85, two tests that this plan replaces:

  ```ts
  test('logs the payload Elysia 2 keeps off the message when it is wanted', () => {
    const { error } = normalizeLoggedError(elysia2Error(), true)

    expect(error.found).toEqual(body)
    expect(error.errors).toEqual([
      { instancePath: '/user/a.b', message: 'too short' }
    ])
  })

  test('adds nothing to an Elysia 1.x error, whose message has the payload', () => {
    const { error } = normalizeLoggedError(elysia1Error(), true)

    expect(error.message).toContain('hunter2')
    expect('found' in error).toBe(false)
  })
  ```

In `__tests__/logger/handle-http-error.test.ts`: `createCaptureTransport` (lines 17-25), `SECRET_PASSWORD = 'hunter2-secret-value'` (line 27), `joinConsoleOutput` (lines 29-34) and `buildLoginApp` (lines 36-45, the `/login` route with `password: t.String({ minLength: 60 })`) are the helpers the new tests use. The test `'logs the full payload when logErrorPayload is enabled'` (lines 84-107) asserts the password is somewhere in the transport events. It keeps passing after the fix, because without `autoRedact` the password is in `found.password`. Do not change it. The test `'a validation failure prints its message on the console line'` (lines 441-464) is the pattern for the console tests.

`autoRedact` masks by key name with `DEFAULT_REDACT_KEYS` and `isSensitiveByDefault` in `src/utils/redact.ts:55-123` (`password`, `token`, `secret`, `authorization` and more), and masks emails and other shapes by value pattern. Under `autoRedact: true` the test email `a@b.co` becomes `[REDACTED]`.

`apps/docs/content/configuration.mdx:136-145`:

````mdx
### `logErrorPayload`

Log the offending payload (`found`/`errors`) from validation errors. Off by default — a failed schema validation embeds the entire request body (passwords, tokens, card fields) in the error message, so leaving this off keeps those values out of your logs and transports.

- **Type:** `boolean`
- **Default:** `false`

```ts
logErrorPayload: true
```
````

The page links to sections of itself as `` [`logQueryParams`](#logqueryparams) `` (line 108). The `autoRedact` section is at line 82, so its anchor is `#autoredact`.

Conventions to match:

- Functions are `const` arrow functions with explicit parameter and return types. Comments say why, never what.
- Tests use `bun:test`, drive the plugin the way a user does (a real Elysia app, a capture transport, `spyConsole`), and assert literal values.

## Commands you will need

Run lint and format from the worktree root. Run the rest from the directory shown.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (root) | exit 0 |
| Build | `cd packages/logixlysia && bun run build` | `Build completed` |
| Lint | `bun run lint` (root) | exit 0 |
| Format | `bun run format` (root) | exit 0; read the diff it makes |
| Typecheck | `cd packages/logixlysia && bun run typecheck` | exit 0 |
| Two test files | `cd packages/logixlysia && bun test ./__tests__/errors/validation-shape.test.ts ./__tests__/logger/handle-http-error.test.ts` | judge by the pass and fail counts; the exit code is 1 on a subset because the coverage threshold covers the whole tree |
| Full suite | `cd packages/logixlysia && bun test` | 0 fail (1253 tests in 100 files after this plan; 1249 before) |
| Docs typecheck | `cd apps/docs && bun run typecheck` | exit 0 |

On a busy machine, tests that start a child process (`lazy pino`, `lazy chalk`, `an app bundled into one file`, `published API surface`, `logixlysia/otel`, `import-cost`) can time out at 5 seconds. If only those fail, re-run the suite once when the machine is quieter. They do not touch the code this plan changes.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/utils/error.ts`
- `packages/logixlysia/__tests__/errors/validation-shape.test.ts`
- `packages/logixlysia/__tests__/logger/handle-http-error.test.ts`
- `apps/docs/content/configuration.mdx` (the `logErrorPayload` section only)
- `.changeset/validation-payload-fields.md` (create)

**Out of scope** (do NOT touch):

- `src/logger/handle-http-error.ts` and `src/index.ts`. They pass the flag and need no change. The `flushLogixlysia` and `onStop` parts of `src/index.ts` belong to another session.
- `src/utils/redact.ts`. The fix works by putting the value under keys the existing rules already handle.
- `src/types/config.ts`. Its comment on `logErrorPayload` ("Log the offending payload (`found`/`errors`) from validation errors") becomes true with this change and stays as it is.
- `apps/docs/content/usage.mdx` line 241 ("A validation error is logged without a stack while `logErrorPayload` is off"). It stays true.
- `apps/docs/content/faq.mdx`, `features/transports.mdx`, `adapters/*.mdx`, `integrations/*.mdx` and the other docs pages another session is editing.
- `src/adapters/shared.ts`, `src/ai.ts`, `src/axiom.ts`, `src/better-stack.ts`, `src/desertant.ts`, `src/output/index.ts`, `src/output/shutdown.ts`, `src/extensions/banner.ts`, `src/utils/report.ts`, `__tests__/adapters/shared.test.ts`: another session owns them.
- Any new option, export or dependency. The public API snapshot must not change.

## Git workflow

- Branch: `fix/validation-payload-fields`, cut from the base commit your task names.
- Three commits, in this order:
  1. `fix(errors): log a failed validation's payload as fields, never inside the message` (`src/utils/error.ts` and both test files)
  2. `docs(configuration): describe the fields logErrorPayload adds`
  3. `chore(changeset): note the validation payload fields`
- Each commit body is one to three short paragraphs of plain prose: what was wrong for a user, what the change does, what a reader would not guess from the diff (for commit 1: that each failure entry also carries the failed value, which is why only `path` and `message` are kept).
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Write the failing tests

**1a.** In `__tests__/errors/validation-shape.test.ts`, replace the two tests at lines 71-85 (`'logs the payload Elysia 2 keeps off the message when it is wanted'` and `'adds nothing to an Elysia 1.x error, whose message has the payload'`) with these three, inside the same `describe('a validation error on either Elysia line', …)`:

```ts
  test('logs the payload Elysia 2 keeps off the message when it is wanted', () => {
    const { error, message } = normalizeLoggedError(elysia2Error(), true)

    expect(message).toBe('Validation failed (body): /user/a.b')
    expect(error.found).toEqual(body)
    expect(error.errors).toEqual([{ message: 'too short', path: '/user/a.b' }])
  })

  test('logs an Elysia 1.x payload as fields, never inside the message', () => {
    const { error, message } = normalizeLoggedError(elysia1Error(), true)

    expect(message).toBe('Validation failed (body): /password')
    expect(error).toEqual({
      errors: [{ message: 'too short', path: '/password' }],
      failedPaths: ['/password'],
      found: body,
      message: 'Validation failed (body): /password',
      name: 'ValidationError',
      type: 'body'
    })
  })

  test('keeps only the path and message of each failure', () => {
    const elysia1 = Object.assign(elysia1Error(), {
      all: [
        {
          message: 'Expected string',
          path: '/pin',
          summary: "Expected property 'pin' to be string but found: 4111111",
          value: 4_111_111
        }
      ]
    })
    const standard = Object.assign(standardSchemaError(), {
      errors: [
        {
          input: 'hunter2',
          message: 'email required',
          path: ['user', { key: 'email' }]
        }
      ]
    })

    expect(normalizeLoggedError(elysia1, true).error.errors).toEqual([
      { message: 'Expected string', path: '/pin' }
    ])
    expect(normalizeLoggedError(standard, true).error.errors).toEqual([
      { message: 'email required', path: '/user/email' }
    ])
  })
```

Also change the comment above `elysia1Error` (line 8). Today it reads:

```ts
// Elysia 1.x: a JSON Pointer per failure in `all`, the payload in the message.
```

Make it:

```ts
// Elysia 1.x: a JSON Pointer per failure in `all`, the payload also in the message.
```

The fixture itself does not change.

**1b.** In `__tests__/logger/handle-http-error.test.ts`, add this test directly after `'logs the full payload when logErrorPayload is enabled'` (which ends at line 107), inside `describe('handleHttpError', …)`:

```ts
  test('with logErrorPayload, autoRedact masks the payload of a failed validation', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildLoginApp({
      config: {
        autoRedact: true,
        disableFileLogging: true,
        disableInternalLogger: true,
        logErrorPayload: true,
        transports: [{ log: transport }]
      }
    })

    const res = await app.handle(
      new Request('http://localhost/login', {
        body: JSON.stringify({ email: 'a@b.co', password: SECRET_PASSWORD }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(res.status).toBe(422)
    expect(events).toHaveLength(1)
    expect(events[0]?.message).toBe('Validation failed (body): /password')
    expect(events[0]?.meta.error).toEqual({
      errors: [{ message: expect.any(String), path: '/password' }],
      failedPaths: ['/password'],
      found: { email: '[REDACTED]', password: '[REDACTED]' },
      message: 'Validation failed (body): /password',
      name: 'ValidationError',
      type: 'body'
    })
    expect(JSON.stringify(events)).not.toContain(SECRET_PASSWORD)
  })
```

`message: expect.any(String)` is deliberate: the validator's wording on Elysia 1.4 is `Expected string length greater or equal to 60`, Elysia 2 may word it differently, and CI runs this file on both.

**1c.** In the same file, add these two tests directly after `'a validation failure prints its message on the console line'` (which ends at line 464), inside `describe('non-Error values', …)`:

```ts
  test('with logErrorPayload, the console line prints the summary, not the body', async () => {
    const { restore, spies } = spyConsole(['error', 'warn'])
    try {
      const app = buildLoginApp({
        config: {
          disableFileLogging: true,
          logErrorPayload: true,
          useColors: false
        }
      })

      const res = await app.handle(
        new Request('http://localhost/login', {
          body: JSON.stringify({ email: 'a@b.co', password: SECRET_PASSWORD }),
          headers: { 'content-type': 'application/json' },
          method: 'POST'
        })
      )

      expect(res.status).toBe(422)
      const output = joinConsoleOutput(spies)
      expect(output).toEndWith(' Validation failed (body): /password')
      expect(output).not.toContain(SECRET_PASSWORD)
    } finally {
      restore()
    }
  })

  test('with logErrorPayload, the JSON console line masks the payload with autoRedact', async () => {
    const { restore, spies } = spyConsole(['error', 'warn'])
    try {
      const app = buildLoginApp({
        config: {
          autoRedact: true,
          consoleFormat: 'json',
          disableFileLogging: true,
          logErrorPayload: true
        }
      })

      await app.handle(
        new Request('http://localhost/login', {
          body: JSON.stringify({ email: 'a@b.co', password: SECRET_PASSWORD }),
          headers: { 'content-type': 'application/json' },
          method: 'POST'
        })
      )

      const output = joinConsoleOutput(spies)
      const line = JSON.parse(output) as {
        error: Record<string, unknown>
        message: string
      }
      expect(line.message).toBe('Validation failed (body): /password')
      expect(line.error.found).toEqual({
        email: '[REDACTED]',
        password: '[REDACTED]'
      })
      expect(output).not.toContain(SECRET_PASSWORD)
    } finally {
      restore()
    }
  })
```

**Verify**: `cd packages/logixlysia && bun test ./__tests__/errors/validation-shape.test.ts ./__tests__/logger/handle-http-error.test.ts` reports **25 pass and 6 fail**. The six failures are exactly the five new tests and the rewritten `'logs the payload Elysia 2 keeps off the message when it is wanted'`. You should see, among others:

```
Expected: "Validation failed (body): /user/a.b"
Received: "must not have fewer than 60 characters"
```

```
Expected: "Validation failed (body): /password"
Received: "{"found":{"email":"a@b.co","password":"hunter2"}}"
```

and, for the text console test, a `Received:` line that contains `hunter2-secret-value`. Keep this output for your report.

### Step 2: Always log the summary, and attach the payload as fields

All edits are in `src/utils/error.ts`.

**2a.** Rename `pathOf` (lines 85-90) to `textOf`, since it now also reads a failure's `message`. Its body does not change. Update its one other caller, the first line of `pointerOf` (line 106): `const pointer = textOf(failure, 'instancePath')`.

**2b.** Replace lines 116-140 (the `failedPaths` function, the `addValidationPayload` function and the doc comments above both) with:

```ts
interface ValidationFailure {
  message: string
  path: string
}

/**
 * Each failure's JSON Pointer and message. Elysia 1.x gives the pointer as a
 * failure's `path`; 2.x writes a dotted `path` that cannot tell a nested key
 * from one containing a dot, and keeps the pointer on `errors`. A failure
 * also carries the value that failed (1.x in `value` and in some summaries,
 * Standard Schema issues in `input`), under a name the `autoRedact` key rule
 * cannot tie to the field, so nothing else is kept.
 */
const validationFailures = (error: {
  all?: unknown[]
  errors?: unknown
}): ValidationFailure[] => {
  if (Array.isArray(error.errors)) {
    return error.errors.map(failure => ({
      message: textOf(failure, 'message'),
      path: pointerOf(failure)
    }))
  }
  return (Array.isArray(error.all) ? error.all : []).map(failure => ({
    message: textOf(failure, 'message'),
    path: textOf(failure, 'path')
  }))
}
```

The pointers it yields are the ones `failedPaths` yielded: the same branch on `errors`, the same `pointerOf` and the same read of `path`. Reading `all` once matters: on Elysia 1.4 it is a getter that runs the validator again.

**2c.** Replace the validation branch at lines 201-217 with:

```ts
  // Elysia 1.x writes the submitted value into a validation error's message,
  // so that message is never logged. The value goes in `found` instead, where
  // `autoRedact` masks its sensitive keys.
  if (isValidationErrorLike(error)) {
    const failures = validationFailures(error)
    const paths = failures.map(failure => failure.path).filter(Boolean)
    const scope = typeof error.type === 'string' ? error.type : 'request'
    const message =
      paths.length > 0
        ? `Validation failed (${scope}): ${paths.join(', ')}`
        : `Validation failed (${scope})`
    const logged: Record<string, unknown> = {
      failedPaths: paths,
      message,
      name: 'ValidationError',
      type: scope
    }
    if (logErrorPayload) {
      logged.found = error.value
      logged.errors = failures
    }
    return { error: logged, message }
  }
```

With the option off the result is exactly what it was: the same four fields and the same message.

**2d.** Delete the line `    addValidationPayload(safe, error)` (line 237) from the `error instanceof Error` branch. A validation error never reaches that branch now.

**Verify**:

- `cd packages/logixlysia && bun test ./__tests__/errors/validation-shape.test.ts ./__tests__/logger/handle-http-error.test.ts` reports **31 pass and 0 fail**.
- `grep -n "addValidationPayload\|failedPaths = \|pathOf" packages/logixlysia/src/utils/error.ts` (from the root) prints nothing.
- `cd packages/logixlysia && bun run typecheck` exits 0.

### Step 3: Say what the option does in the docs

In `apps/docs/content/configuration.mdx`, replace the one paragraph under `### \`logErrorPayload\`` (line 138) with a paragraph that states these facts and nothing more. Each was observed on the patched code with the `/login` app from Step 1:

1. It adds the submitted value and the list of failures to the record of a failed validation, as `error.found` and `error.errors`.
2. Each entry in `errors` keeps only the failure's `path` and `message`.
3. The line's message is a summary such as `Validation failed (body): /password` whether the option is on or off.
4. It is off by default because `found` is the whole value that failed validation, such as the request body, and that routinely carries passwords, tokens and card fields.
5. With [`autoRedact`](#autoredact) on, sensitive keys such as `password` inside `found` are masked.

A wording that satisfies this:

```mdx
Add the submitted value and the list of failures to the record of a failed validation, as `error.found` and `error.errors`. Each entry in `errors` keeps only the failure's `path` and `message`. The line's message is a summary such as `Validation failed (body): /password` whether this option is on or off. Off by default, because `found` is the whole value that failed validation, such as the request body, and request bodies routinely carry passwords, tokens and card fields. Turn on [`autoRedact`](#autoredact) as well to mask sensitive keys such as `password` inside `found`.
```

Do not say the path is a JSON Pointer: with a Standard Schema validator on Elysia 1.4 it is dotted (`password`). Leave the Type, Default and code sample lines as they are. Use no long dashes.

**Verify**: `bun run format` (root), read its diff, then `bun run lint` exits 0 and `cd apps/docs && bun run typecheck` exits 0.

### Step 4: Changeset, gates, commits

Create `.changeset/validation-payload-fields.md`:

```md
---
'logixlysia': patch
---

<one short paragraph for a user of the package>
```

`patch`, because it makes the option do what its documentation already says and adds no option or export. The paragraph must tell a user, in plain words:

- With `logErrorPayload: true`, a failed validation is now logged with the `Validation failed (…)` summary as its message, the same as with the option off. Before, on Elysia 1.4, the message was Elysia's JSON text with the whole submitted body in it, which `autoRedact` could not mask.
- The submitted value is now in `error.found` and the failures in `error.errors`, each with only `path` and `message`. `autoRedact` masks keys such as `password` inside `found`.
- Anyone who read the JSON text out of the message should read these fields. `error.code` and `error.status` no longer appear on that error object; the record's `status` still does.

Write no mention of who found the problem or how.

**Verify**: `cd packages/logixlysia && bun run build` succeeds, then `bun test` reports 0 fail (see the note under "Commands you will need" about child-process timeouts). Make the three commits from "Git workflow", staging files by name. `git status --porcelain` is empty afterwards.

## Test plan

- `__tests__/errors/validation-shape.test.ts`: one rewritten test and two new ones (Step 1a), on the hand-built Elysia 1.x, Elysia 2 and Standard Schema shapes the file already uses. They pin the message, the exact error object, and that a failure's `value`, `summary` and `input` are dropped.
- `__tests__/logger/handle-http-error.test.ts`: three new tests (Steps 1b and 1c) on a real Elysia app, one per sink the nearby validation tests cover: the transport, the text console line, and the JSON console line. Each asserts the fake password is absent from everything the sink received.
- Six fail before Step 2 and all pass after it. The suite grows from 1249 to 1253 tests.

## Done criteria

ALL must hold:

- [ ] Your report quotes the Step 1 run, made before any source change, with 25 pass and 6 fail
- [ ] `cd packages/logixlysia && bun test ./__tests__/errors/validation-shape.test.ts ./__tests__/logger/handle-http-error.test.ts` reports 31 pass, 0 fail
- [ ] `cd packages/logixlysia && bun test` reports 0 fail
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0; `cd apps/docs && bun run typecheck` exits 0
- [ ] `grep -n "addValidationPayload" packages/logixlysia/src/utils/error.ts` prints nothing
- [ ] `git diff <base>..HEAD --stat` lists exactly the five in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/__tests__/api` is empty (no public API change)
- [ ] The test `'logs the full payload when logErrorPayload is enabled'` is unchanged and passes

## STOP conditions

Stop and report (do not improvise) if:

- The excerpts in "Current state" do not match the code.
- Step 1 does not give 25 pass and 6 fail, or a failing test fails for a reason other than the one shown (for example `found` is masked but the message is still the JSON text in a way the plan does not describe).
- After Step 2, `'does not leak the request body when a validation error occurs'`, `'detects a validation error by code when class names are minified'` or any `failedPaths` test fails. The off path must not change.
- The fix seems to need a change to `src/utils/redact.ts`, to a caller of `normalizeLoggedError`, or to any out-of-scope file.
- The API snapshot test fails.
- You are told the `elysia-2` CI job fails on one of the new tests. The Elysia 2 shape was not observed while this plan was written (see "Maintenance notes"); report the failure output rather than loosening the assertion.

## Maintenance notes

- **Not checked**: Elysia 2 was not installed when this plan was written. The reading of an Elysia 2 error (the `errors` array, `instancePath` or a Standard Schema `path`, the value on `value`) is what `validation-shape.test.ts` already assumed at `c019a4f`, and the code keeps reading it the same way. The integration tests in Step 1b and 1c run on Elysia 2 only in CI. If Elysia 2 does not keep the submitted value on `value`, `found` is `undefined` there and the transport and JSON-console tests fail in the `elysia-2` job.
- On Elysia 2, `error.errors` used to be the validator's own entries (for example `{ instancePath, message }`). It is now `{ message, path }` on both lines. That is deliberate: Standard Schema issues from some validators carry the failed input (`input`, and text such as `received`), and the plugin cannot know every validator's field names.
- A failure's `message` is the validator's text. TypeBox's messages do not contain the value. A custom error message, or a validator whose type-mismatch message quotes the input, can. `autoRedact`'s value patterns still apply to it; its key rule cannot.
- `found` is masked by key only when it is an object. A body that is a bare string, or a value whose sensitive field has a name outside the key list, is logged as it is. That is what the option asks for.
- A reviewer should check that the off path is byte-for-byte the same (same four fields, same message) and that `validationFailures` reads `all` once.
- Left out: with a Standard Schema validator on Elysia 1.4, `failedPaths` and each failure's `path` are dotted (`password`, `user.email`), not JSON Pointers, because Elysia 1.4's `all` joins the issue path with dots. That was so before this plan and is a separate fix.
