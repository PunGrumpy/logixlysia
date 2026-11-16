# File logging

`logFilePath` makes the plugin append every line to a file as well as the console. The file line has a fixed layout: timestamp, level, method, path, status, duration, message, then the context as JSON.

## Sub-features

- `file-create` creates the file and its directory.
- `file-line` writes the fixed layout, `-` as the status of a `log.*` line, and context as JSON.
- `file-flush` has every line on disk once the server stops.

## How to get to it (user POV)

- Pass `config.logFilePath` to `logixlysia()`.

## Driving it with control-logixlysia

Preconditions:

- `work/file.ts` holds this app.

```ts
import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

export default new Elysia()
  .use(logixlysia({ config: { logFilePath: './logs/app.log' } }))
  .get('/orders', ({ log }) => {
    log.info('listed orders', { count: 3 })
    return []
  })
```

- **Serve one request.** Run `$C run --run "$RUN" --app file.ts --req 'GET /orders'`. Exit code `0`, and the server stop line reads `stopped by SIGTERM, exit code 0`.
- **File written.** The report has `--- file logs/app.log` with two lines: `<iso> INFO GET /orders - <n>ms listed orders {"count":3}` and `<iso> INFO GET /orders 200 <n>ms`.

## Gotchas

- The path is relative to the server's working directory, which is `work/`.
- The file layout ignores `customLogFormat` and `timestamp.translateTime`. Those shape the console only.
- The report lists only files modified during the run. A file left by an earlier run and not touched again is not shown.
