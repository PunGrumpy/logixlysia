# Plan 108: the file log line matches what the docs promise

## Why this matters

`config.logFilePath` is how a team keeps logs for after-the-fact debugging. The line it wrote had no timestamp, no status and no context, so a 500 could not be told from a 200 and two lines could not be ordered. The File Logging page promised a timestamp and a status. The maintainer wants logixlysia ahead of the reference library on the look and use of its output, and a file you cannot read after an incident is a gap.

## Evidence

- Reproduced on Bun 1.3.14 with a 200, a 500 and one `log.info('hello', { userId: 7 })`. The file held `INFO 6.77ms GET /ok `, `ERROR 1.86ms GET /boom Payment failed` and `INFO 0.17ms GET /info hello`. No timestamp, no status, no context.
- History: the format string in `src/output/file.ts` has had this shape since the package rename (`692057f`). The docs example (`881e91d`, with a fox icon and a local-time stamp) was never what the code wrote. No commit records a decision to drop the timestamp or the status, so the docs were not stale. The code never got there.
- No existing option shapes the file line. `customLogFormat` and `timestamp.translateTime` only reach the console formatter.

## Change

- `src/output/file.ts` writes `<ISO timestamp> <level> <method> <path> <status> <duration>ms[ <message>][ <context JSON>]`.
- Status is `getStatusCode(data.status)`, or `-` when the record has none (a `log.info` call), so a manual line never claims a 200.
- Context is the JSON the console `{context}` token uses, one line, with the same sanitizing. Redaction already ran before the sink.
- `apps/docs/content/features/file-logging.mdx` shows the real lines and the field order.
- Changeset is `minor`: the on-disk layout changed, so a parser of the old file needs an update.

## Verification

- `__tests__/output/file-line.test.ts` asserts the bytes in a temp file for a 200, a 500, a redacted `log.info` with context, and the absence of ANSI. It failed on the old source (3 of 4) and passes now.
- Size based rotation tests in `file.test.ts` were resized for the longer line. `race-condition.test.ts` has the new line regex.
- `bun run lint`, `bun run typecheck`, `bun run build && bun test`.

## Out of scope

- Rotation, buffering and flush logic.
- Console formatting.
- A file line that honors `customLogFormat` or `translateTime`. That would be a new option surface.
