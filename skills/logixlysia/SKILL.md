---
name: logixlysia
description: Coding guidelines, API usage, and configuration standards for using the Logixlysia logger plugin in Elysia.js applications.
---

# Logixlysia API & Coding Standards

Keep this file in sync with `packages/logixlysia/package.json#exports`.

Logixlysia is an opinionated, high-performance logger plugin for **Elysia.js** applications. It provides request-scoped logging, structured logging via **Pino**, context propagation, automatic PII redaction, and WebSocket tracing.

---

## 1. Installation and Basic Setup

To register Logixlysia in an Elysia application:

```typescript
import { Elysia } from 'elysia'
import { logixlysia } from 'logixlysia'

const app = new Elysia()
  .use(logixlysia()) // Register with default options
  .get('/', () => 'Hello Elysia')
  .listen(3000)
```

Create the plugin once and `.use()` that same instance in every module. Calling `logixlysia()` again per module breaks durations, request IDs, and shutdown flushing for the later instances.

---

## 2. Request-Scoped Logging

Logixlysia derives a `log` object (of type `RequestScopedLogger`) onto the Elysia request context. Always prefer using this request-scoped logger inside route handlers instead of importing global loggers, as it tracks timing, request paths, and request-specific context.

### Basic Logging in Route Handlers

```typescript
app.get('/user/:id', ({ params, log }) => {
  log.info('Fetching user', { userId: params.id })
  return { success: true }
})
```

### Merging Request Context

You can append custom fields to the current request's log using `log.mergeContext()`. These fields are automatically displayed as an easy-to-read tree structure underneath the main HTTP log line.

```typescript
app.get('/order/checkout', ({ log }) => {
  log.mergeContext({ cartId: 'cart-123', promoUsed: true })

  log.info('Cart validated') // Logs with cartId and promoUsed context
  return { status: 'processed' }
})
```

### Logging a Caught Error

`log.error` takes a message or whatever you caught. A value that is not a string is serialized like a thrown error, with its name, its `HttpError` fields and its cause.

```typescript
app.post('/pay', async ({ log }) => {
  try {
    await charge()
    return { success: true }
  } catch (err) {
    log.error(err, { step: 'payment' })
    return { success: false }
  }
})
```

A handler's own lines (`log.info`, `store.logger.info(request, …)`, `useLogger().info`) are written in addition to the request's final line: the access line, or the error line when the handler throws anything other than an Elysia `status()` result below `400`. They are written before the response exists, so they carry no status. The final line follows with the status the client got, the full `durationMs` and the response-phase enricher fields.

---

## 3. Configuration Options

Use the options object to configure presets, logging thresholds, filters, and formats:

```typescript
app.use(
  logixlysia({
    preset: 'prod', // Options: 'dev' | 'prod' | 'json'
    config: {
      showStartupMessage: true,
      startupMessageFormat: 'banner', // 'simple' | 'banner'
      ip: true, // Log client IP address
      logQueryParams: true, // Log URL query parameters

      // Request tracing and propagation
      requestId: {
        enabled: true,
        header: 'X-Request-Id' // Default tracing header
      },

      // Custom formatting and coloring
      consoleFormat: 'text', // 'json' prints one JSON line per record; the prod and json presets set it
      useColors: true,
      slowThreshold: 500, // Duration below this logs as green
      verySlowThreshold: 1000, // Duration at or above this logs as red
      showContextTree: true, // Show mergeContext properties as tree branches
      contextDepth: 2, // How deep to expand nested objects in the tree

      // Auto-redaction of PII (emails, JWTs, card numbers)
      autoRedact: true,
      redactPatterns: [/cust_[a-z0-9]+/], // Extra value shapes to mask; needs autoRedact: true

      // AsyncLocalStorage integration
      useAsyncLocalStorage: true
    }
  })
)
```

---

## 4. AsyncLocalStorage Integration

If `useAsyncLocalStorage` is enabled in configuration, you can retrieve the request-scoped logger anywhere in your codebase (e.g. inside database services, controllers, or helper files) using `useLogger()`.

```typescript
import { useLogger } from 'logixlysia'

export const fetchFromDatabase = async (userId: string) => {
  const log = useLogger() // Fetches the logger for the current async execution context
  log?.info('Querying database', { userId })

  // Database logic...
}
```

---

## 5. WebSocket Integration

`wrapWs` lives on the plugin instance and takes the route path first, then the hooks: `plugin.wrapWs(path, hooks)`. It logs open, message, and close itself, so hooks are optional: add them only to layer in your own behavior. Spread the result into `.ws()`'s second argument. Inside a hook, `ws.data.store.logger` is the plugin's `Logger`, and `mergeContext` takes the WebSocket instance (or a key) as its first argument, matching the HTTP `store.logger` API.

```typescript
import { Elysia } from 'elysia'
import { logixlysia } from 'logixlysia'

const logger = logixlysia()

const app = new Elysia().use(logger).ws('/chat', {
  ...logger.wrapWs('/chat', {
    open(ws) {
      ws.data.store.logger.mergeContext(ws, { room: 'lobby' })
    },
    message(ws, message) {
      ws.send(message)
    }
    // close is optional: wrapWs logs it automatically
  })
})
```

---

## 6. Code Standards and Constraints

When writing or modifying code relating to Logixlysia:

1. **Never use `any`** for context arguments. Leverage the `RequestScopedLogger` and `LogixlysiaContext` interfaces.
2. **Prefer explicit return types** for custom logging utilities and transport implementations.
3. **Empty Singleton Slots Constraint**: If writing middleware or plugins that extend Elysia context slots, avoid returning `Record<string, never>`. Use a dedicated empty interface like:
   ```typescript
   export interface EmptyElysiaSlot {
     readonly __logixlysiaEmpty?: never
   }
   ```
   to prevent context properties from narrowing to `never`.

---

## 7. Destinations

Each built-in destination is a factory imported from its own subpath, e.g. `logixlysia/axiom`. Pass the result to `config.transports`. Set `useTransportsOnly: true` to skip console and file output and ship only to transports. `config.onError` receives sink failures (`transport`, `file`, `rotation`, `enricher`, `shutdown`, `format`) instead of the rate-limited stderr fallback.

```typescript
import { logixlysia } from 'logixlysia'
import { createAxiomTransport } from 'logixlysia/axiom'

logixlysia({
  config: {
    transports: [createAxiomTransport()],
    useTransportsOnly: true,
    onError: ({ sink, error }) => {
      console.error(`${sink} failed`, error)
    }
  }
})
```

The available destinations: `logixlysia/axiom`, `logixlysia/better-stack`, `logixlysia/clickhouse`, `logixlysia/datadog`, `logixlysia/hyperdx`, `logixlysia/loki`, `logixlysia/otlp`, `logixlysia/posthog`, `logixlysia/sentry`.

`logixlysia/http` exports `createHttpTransport`, the batching, retrying core the built-in destinations share. For a backend that takes an HTTP POST, describe the request body and it gives you batching, retry with backoff, a bounded queue, `onDropped`, `flush` and `close`. A `log` you write yourself gets none of that.

```typescript
import { createHttpTransport, entryText } from 'logixlysia/http'

const elasticsearch = createHttpTransport({
  name: 'elasticsearch',
  url: 'http://elasticsearch:9200/logs/_bulk',
  headers: { 'Content-Type': 'application/x-ndjson' },
  options: { maxBatchSize: 100, onError: console.error },
  body: entries =>
    entries
      .map(entry =>
        [
          JSON.stringify({ index: {} }),
          JSON.stringify({
            ...entry.meta,
            level: entry.level,
            message: entryText(entry),
            '@timestamp': entry.timestamp.toISOString()
          })
        ].join('\n')
      )
      .join('\n') + '\n'
})
```

Set `minLevel` on any transport to send it only records at that level or louder. The levels, quietest first, are `DEBUG`, `INFO`, `WARNING` and `ERROR`.

```typescript
import { createAxiomTransport } from 'logixlysia/axiom'
import { createSentryTransport } from 'logixlysia/sentry'

logixlysia({
  config: {
    transports: [
      createSentryTransport({ minLevel: 'ERROR' }),
      createAxiomTransport()
    ]
  }
})
```

---

## 8. Sampling

`config.sampling.head` keeps a percentage of records per level as they're emitted; levels left out keep everything. `config.sampling.tail` rescues head-dropped records for a request once its outcome is known, by status, duration, path glob, or a `keep` predicate. `keep` receives `durationMs`, `pathname`, `status` and a copy of the request's `context`, and runs only when no other tail rule matched.

```typescript
logixlysia({
  config: {
    sampling: {
      head: { DEBUG: 1, INFO: 10 },
      tail: {
        status: 400,
        durationMs: 1000,
        paths: ['/checkout/**'],
        keep: ({ context }) => context.plan === 'enterprise'
      },
      maxBufferedPerRequest: 100 // default
    }
  }
})
```

Sampling is off unless at least one head rate is below `100`.

---

## 9. Enrichers

`config.enrichers` runs contributors on every request and merges their return value into the request context, reaching the console tree, file logs, and every transport. Each entry is an `Enricher` (with `request` and/or `response` phases) or a bare function treated as the request phase.

```typescript
import {
  geoEnricher,
  traceparentEnricher,
  userAgentEnricher,
  sizeEnricher
} from 'logixlysia/enrichers'

logixlysia({
  config: {
    enrichers: [
      traceparentEnricher(),
      geoEnricher(),
      userAgentEnricher(),
      sizeEnricher(),
      request => ({ tenant: request.headers.get('x-tenant') })
    ]
  }
})
```

A custom enricher matches this shape:

```typescript
interface Enricher {
  request?: (request: Request) => Record<string, unknown> | undefined
  response?: (input: {
    request: Request
    status: number
    durationMs: number
    headers: Record<string, unknown>
  }) => Record<string, unknown> | undefined
}
```

---

## 10. Structured errors

Throw `HttpError` for failures that should carry context to both the log and the response. `code`, `why`, `fix`, and `link` are client-safe and appear in the response; `internal` is log-only diagnostics, never serialized.

```typescript
import { HttpError } from 'logixlysia'

throw new HttpError(402, 'Card declined', {
  code: 'PAYMENT_DECLINED',
  why: 'The issuing bank rejected the charge.',
  fix: 'Try a different card, or contact your bank.',
  link: 'https://docs.example.com/errors/payment-declined',
  internal: { gatewayCode: 'do_not_honor' }
})
```

A bare `new HttpError(404, 'Not found')` still responds with the plain message.

`logixlysia/errors` exports `HttpError` and `isHttpErrorPayload` without pulling in Elysia or pino; use it in shared or client code.

---

## 11. Typed fields

Supply a field type parameter to `logixlysia` and `useLogger` so `mergeContext` and `log.info(message, fields)` calls are checked against your app's context shape.

```typescript
interface CheckoutFields {
  cartId: string
  itemCount: number
}

const app = new Elysia().use(logixlysia<CheckoutFields>())

app.get('/checkout', ({ log }) => {
  log.mergeContext({ cartId: 'cart_9', itemCount: 3 }) // checked against CheckoutFields
})

// In a nested service layer:
import { useLogger } from 'logixlysia'
const log = useLogger<CheckoutFields>()
```

`useLogger()` returns a request-scoped logger only with `useAsyncLocalStorage: true`; without it, it returns a logger that writes nothing. The first such call prints one warning to stderr naming the option, outside production only.

---

## 12. Neural redaction

`autoRedact` is a synchronous, pattern-based pass that runs on every record. `logixlysia/desertant` applies a neural PII model to records leaving the process, catching free-text PII that pattern matching misses. Wrap a transport with `withRedaction`:

```typescript
import { Redact } from '@desert-ant-labs/redact/native'
import { createAxiomTransport } from 'logixlysia/axiom'
import { withRedaction } from 'logixlysia/desertant'

const axiom = createAxiomTransport()

logixlysia({
  config: {
    autoRedact: true,
    transports: [withRedaction(axiom, Redact.load)]
  }
})
```

---

## 13. Tracing and AI usage

`logixlysia/otel` merges the active OpenTelemetry span's `trace_id`, `span_id`, `trace_flags` and `trace_sampled` into the request context. It needs `@opentelemetry/api` installed and an active span. Call it from `onRequest`, after the plugin:

```typescript
import { Elysia } from 'elysia'
import { logixlysia } from 'logixlysia'
import { injectTraceContext } from 'logixlysia/otel'

const app = new Elysia().use(logixlysia()).onRequest(({ request, store }) => {
  injectTraceContext(store.logger, request)
})
```

`logixlysia/ai` merges LLM usage under `ai` in the request context, so it appears on the request's access line:

```typescript
import { mergeAIMetrics } from 'logixlysia/ai'

app.post('/chat', ({ request, store }) => {
  mergeAIMetrics(store.logger, request, {
    model: 'claude-sonnet',
    inputTokens: 1200,
    outputTokens: 400,
    totalTokens: 1600
  })
  return { ok: true }
})
```

---

## 14. Choosing what is logged

`config.logFilter` chooses routes by pathname glob (`**` crosses `/`, `*` and `?` do not). `exclude` silences the routes it names, `include` logs only the routes it names, and `exclude` beats `include`. An excluded request writes nothing: no access line, no handler lines and no error line, even when it answers `500`.

```typescript
logixlysia({
  config: {
    logFilter: {
      include: ['/api/**'],
      exclude: ['/api/internal/**', '/health']
    }
  }
})
```

`logFilter.accessLine` hides only the access line of the paths it names. A handler's `log.*` lines still write. An error line is never hidden, and neither is an access line whose status is `400` or above. Every other access line follows the path rules. Use it for health checks whose failures should still be logged.

```typescript
logixlysia({
  config: {
    logFilter: {
      accessLine: { exclude: ['/health', '/metrics'] }
    }
  }
})
```

---

## 15. Background jobs

`runJob` lives on the plugin instance: `plugin.runJob(name, fn)`. It runs `fn` outside a request and writes one final line for it the way a request gets its access line: through transports, the file sink and redaction, and subject to `logFilter.level` and sampling. The line is labelled `JOB` with the job name as its path, with status `200` when `fn` returns and `500` when it throws. A thrown error is logged and then rethrown. Inside `fn`, `useLogger()` returns the job's logger without `useAsyncLocalStorage`.

```typescript
import { flushLogixlysia, logixlysia } from 'logixlysia'
import type { Options } from 'logixlysia'

const options: Options = { config: { service: 'billing' } }
const logs = logixlysia(options)

await logs.runJob('nightly-sync', async log => {
  const rows = await loadRows()
  log.mergeContext({ rows: rows.length })
})

// A script exits as soon as the job returns; flush so batching transports send first.
await flushLogixlysia(options)
```

---

## 16. Testing your logs

`logixlysia/testing` exports `createMemoryTransport`, a transport that keeps records in memory so a test can assert on what a route logged. Pass it in `config.transports`, with `useTransportsOnly: true` to keep the console quiet. In the example below, the request writes two records: the handler's line, then the access line with the final status and an empty `message`.

```typescript
import { expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from 'logixlysia'
import { createMemoryTransport } from 'logixlysia/testing'

test('logs the order id', async () => {
  const memory = createMemoryTransport()
  const app = new Elysia()
    .use(
      logixlysia({
        config: {
          showStartupMessage: false,
          transports: [memory],
          useTransportsOnly: true
        }
      })
    )
    .get('/orders/:id', ({ log, params }) => {
      log.info('order loaded', { orderId: params.id })
      return { id: params.id }
    })

  await app.handle(new Request('http://localhost/orders/42'))

  const line = memory.find(record => record.message === 'order loaded')
  expect(line?.context).toMatchObject({ orderId: '42' })
  expect(memory.last()).toMatchObject({
    method: 'GET',
    path: '/orders/42',
    status: 200
  })
})
```
