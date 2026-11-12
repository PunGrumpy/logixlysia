# Plan 110: `preset: 'json'` and `preset: 'prod'` print one JSON line per record

## Why this matters

`usage.mdx` promises "JSON logs + autoRedact" for `prod` and "minimal JSON console" for `json`. Both print the human text line, emoji included. Loki, Datadog and CloudWatch cannot parse it, so the production preset needs extra config before it is usable in production.

## Evidence

- Bun 1.3.14, `preset: 'json'`, `GET /` prints `2026-11-12T05:54:04.092Z 🦊 GET     / 200 26ms`. `prod` prints the same with `/users/[REDACTED]` for a redacted path.
- `PRESET_DEFAULTS` in `src/config/resolve-options.ts` only turns off colours, the context tree and the banner. No key chooses the console format.
- History: presets came in #311 with the JSON wording in `usage.mdx`. Text output was not a documented choice.

## Change

Data shape. The console JSON line is the record transports already receive, `{ request: { method, url }, ...data, durationMs }` built by `logToTransports`, plus the `level` and `message` passed beside it and the ISO-8601 `timestamp` the adapters stamp. It is written with `stringifyForLog`, the serialiser the adapters use. Keys in this order, absent ones left out:

| Key | Value |
| --- | --- |
| `timestamp` | ISO-8601 string at write time |
| `level` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `message` | the line's message, `''` for an access line |
| `request` | `{ method, url }`; `url` drops the query unless `logQueryParams`, redacted under `autoRedact` |
| `status` | access and error lines |
| `durationMs` | number |
| `context` | request context, `requestId` included when on |
| `error` | `{ name, message, cause, ... }` as `normalizeLoggedError` gives it |
| other keys | any extra `data` keys from `logger.log`, in their order |

Organising structure. One resolved value, `config.consoleFormat: 'text' | 'json'`, defaults to `text`. `json` and `prod` presets set `json`. `createFormatContext` reads it once; `writeRecord` picks the line builder from it. The record builder moves out of `logToTransports` so the transport meta and the console line share it.

`consoleFormat: 'text'` brings the text line back under either preset. A new key is needed because no existing key chooses the console format, and a preset can only set config keys.

Speed. The first cut was slower than the text line: `stringifyForLog` ran a JS replacer on every value, 2.3 µs on a seven-key record against 0.34 µs for plain `JSON.stringify`. It now scans the value first and uses plain `JSON.stringify` when nothing needs the replacer (no BigInt, Error, Map, Set, custom `toJSON`, cycle or deep nesting). A JSON-only console also skips the `new URL` parse the text line needs for its pathname.

## Verification

- `__tests__/plugin/json-console.test.ts`: per preset, one request gives one console call holding one line `JSON.parse` accepts with the keys above; a 500 with a cause; a `log.info` with context; under `prod` a secret in the path and context; a value with a newline. `consoleFormat: 'text'` restores the text line. The default and `dev` lines match literals captured before the change.
- New-behaviour tests fail on unchanged source.
- In-process bench, alternating text and JSON runs, 21 rounds per side, two runs. `json` preset: 4.0 µs to 3.2 µs per record, 9.0 µs to 7.8 µs per request. `prod`: 24.0 µs to 23.2 µs per record, no measurable difference per request, where redaction costs about 17 µs of the record.
- `bun run lint`, `bun run typecheck`, `cd packages/logixlysia && bun run build && bun test`.

## Out of scope

- The file sink line and transport payloads.
- `src/utils/redact.ts` and sanitize speed.
- Error rendering in the pretty tree.
- A `service` field in the JSON line. Transports do not carry it today.
- Moving `WARNING` and `ERROR` lines to stdout. They stay on stderr, as the text line does.
