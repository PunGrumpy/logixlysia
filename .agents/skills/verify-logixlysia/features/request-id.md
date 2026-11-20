# Request ID

With `requestId` on, the plugin reads `x-request-id` from the request, or generates a UUID when it is missing or invalid, sets it on the response header, and puts it on the request's log lines as `requestId`.

## Sub-features

- `request-id-generate` generates a UUID when the header is missing.
- `request-id-honor` keeps a valid upstream ID of 1 to 128 characters of `A-Z a-z 0-9 . _ -`.

## How to get to it (user POV)

- Pass `config.requestId: true` to `logixlysia()`, or use `preset: 'prod'`.
- Send `x-request-id` from the client or a proxy.

## Driving it with control-logixlysia

Preconditions:

- `work/request-id.ts` holds this app.

```ts
import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

export default new Elysia()
  .use(logixlysia({ config: { consoleFormat: 'json', requestId: true } }))
  .get('/ping', () => 'pong')
```

- **Generated ID.** Run `$C run --run "$RUN" --app request-id.ts --label generated --req 'GET /ping'`. The response has an `x-request-id` UUID, and the access line's `context.requestId` is the same UUID.
- **Upstream ID.** Run `$C run --run "$RUN" --app request-id.ts --label upstream --header 'x-request-id: upstream-abc_123' --req 'GET /ping'`. The response header and `context.requestId` are both `upstream-abc_123`.

## Gotchas

- `--header` goes on every request of a run. Use separate runs to compare a request with and without the header.
- An upstream ID with a character outside the allowed set is replaced by a UUID. That is the documented behavior, not a failure.
