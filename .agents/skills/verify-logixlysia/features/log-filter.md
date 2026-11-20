# Route filter

`logFilter.include` and `logFilter.exclude` take path globs. A request whose path matches `exclude`, or misses a non-empty `include`, writes nothing at all: no access line and no `log.*` lines from its handler. `exclude` wins over `include`.

## Sub-features

- `filter-exclude` silences an excluded path, handler lines included.
- `filter-include` logs a path that matches `include`.
- `filter-miss` silences a path that misses a non-empty `include`.

## How to get to it (user POV)

- Pass `config.logFilter.include` and `config.logFilter.exclude` to `logixlysia()`.

## Driving it with control-logixlysia

Preconditions:

- `work/filter.ts` holds this app.

```ts
import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

export default new Elysia()
  .use(
    logixlysia({
      config: { logFilter: { exclude: ['/health'], include: ['/api/**'] } }
    })
  )
  .get('/health', ({ log }) => {
    log.info('health handler ran')
    return 'ok'
  })
  .get('/api/v1/orders', ({ log }) => {
    log.info('orders handler ran')
    return []
  })
  .get('/home', () => 'home')
```

- **Serve the three routes.** Run `$C run --run "$RUN" --app filter.ts --req 'GET /health' --req 'GET /api/v1/orders' --req 'GET /home'`. Exit code `0` and all three respond `200`.
- **Included route.** stdout has `INFO  GET     /api/v1/orders - <n>ms orders handler ran` and `INFO  GET     /api/v1/orders 200 <n>ms`.
- **Excluded and missed routes.** stdout and stderr contain no `/health` and no `/home` line, and no `health handler ran`.

## Gotchas

- A filtered request still gets its response. Assert the absence of log lines, not of the response.
- `**` crosses `/`. `*` and `?` do not, so `/api/*` would miss `/api/v1/orders`.
