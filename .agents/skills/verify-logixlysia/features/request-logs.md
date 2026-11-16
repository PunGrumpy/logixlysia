# Request logs

Every request the plugin sees ends in one access line with the method, path, status and duration. Lines a handler writes with `log.info`, `log.warn` and the rest appear before it, and fields merged with `log.mergeContext` show on the access line as a context tree.

## Sub-features

- `access-line` writes one line per request with method, path, status and duration.
- `handler-log` writes a `log.info` line with status `-` and its own context.
- `merge-context` shows `mergeContext` fields under the access line.
- `status-level` logs 2xx as `INFO` on stdout, 4xx as `WARN` and 5xx as `ERROR` on stderr.
- `thrown-error` logs a thrown error's message and where it was thrown.

## How to get to it (user POV)

- Add `.use(logixlysia())` to an Elysia app and serve requests.
- Call `log.info(message, context)` or `log.mergeContext(fields)` in a handler.
- Throw from a handler, or request a route that does not exist.

## Driving it with control-logixlysia

Preconditions:

- `work/requests.ts` holds this app.

```ts
import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

export default new Elysia()
  .use(logixlysia())
  .get('/users/:id', ({ log, params }) => {
    log.mergeContext({ userId: params.id })
    log.info('loaded user', { source: 'cache' })
    return { id: params.id }
  })
  .get('/boom', () => {
    throw new Error('database is down')
  })
```

- **Serve three requests.** Run `$C run --run "$RUN" --app requests.ts --req 'GET /users/42' --req 'GET /boom' --req 'GET /nope'`. Exit code `0`. The responses are `200 {"id":"42"}`, `500 database is down` and `404 NOT_FOUND`.
- **Handler line and access line.** stdout has `INFO  GET     /users/42 - <n>ms loaded user` with a tree of `userId  42` and `source  cache`, then `INFO  GET     /users/42 200 <n>ms` with `└─ userId  42`.
- **Thrown error.** stderr has `ERROR GET     /boom 500 <n>ms database is down` with `└─ error.at  requests.ts:12:15`.
- **Unknown route.** stderr has `WARN  GET     /nope 404 <n>ms NOT_FOUND` with `└─ error.code  NOT_FOUND`.

## Gotchas

- The startup banner (`Elysia v<version>` and the URL) is printed to stdout before the first line. It is not a request log.
- The handler line carries the handler's own context. Only `mergeContext` fields reach the access line.
- The access line for a 4xx or 5xx is on stderr. A check that reads stdout alone misses it.
