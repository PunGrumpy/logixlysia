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
        header: 'X-Request-Id', // Default tracing header
      },

      // Custom formatting and coloring
      useColors: true,
      slowThreshold: 500, // Duration below this logs as green
      verySlowThreshold: 1000, // Duration at or above this logs as red
      showContextTree: true, // Show mergeContext properties as tree branches
      contextDepth: 2, // How deep to expand nested objects in the tree

      // Auto-redaction of PII (emails, JWTs, card numbers)
      autoRedact: true,

      // AsyncLocalStorage integration
      useAsyncLocalStorage: true,
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

`wrapWs` lives on the plugin instance and takes the route path first, then the hooks: `plugin.wrapWs(path, hooks)`. It logs open, message, and close itself, so hooks are optional: add them only to layer in your own behavior. Spread the result into `.ws()`'s second argument. Inside a hook, the request-scoped logger is `ws.data.store.logger`, and it takes the WebSocket instance (or a key) as the first argument to `mergeContext`, matching the HTTP `store.logger` API.

```typescript
import { Elysia } from 'elysia'
import { logixlysia } from 'logixlysia'

const logger = logixlysia()

const app = new Elysia()
  .use(logger)
  .ws('/chat', {
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

Each built-in destination is a factory imported from its own subpath, e.g. `logixlysia/axiom`. Pass the result to `config.transports`. Set `useTransportsOnly: true` to skip console output and ship only to transports. `config.onError` receives sink failures (`transport`, `file`, `rotation`, `enricher`) instead of the rate-limited stderr fallback.

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

---

## 8. Sampling

`config.sampling.head` keeps a percentage of records per level as they're emitted; levels left out keep everything. `config.sampling.tail` rescues head-dropped records for a request once its outcome is known, by status, duration, or path glob.

```typescript
logixlysia({
  config: {
    sampling: {
      head: { DEBUG: 1, INFO: 10 },
      tail: {
        status: 400,
        durationMs: 1000,
        paths: ['/checkout/**']
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
import { geoEnricher, traceparentEnricher, userAgentEnricher, sizeEnricher } from 'logixlysia/enrichers'

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

---

## 12. Neural redaction

`autoRedact` is a synchronous, pattern-based pass that runs on every record. `logixlysia/desertant` applies a neural PII model to records leaving the process, catching free-text PII that pattern matching misses. Wrap a transport with `withRedaction`:

```typescript
import { Redact } from '@desert-ant-labs/redact/native'
import { withRedaction } from 'logixlysia/desertant'
import { createAxiomTransport } from 'logixlysia/axiom'

const axiom = createAxiomTransport()

logixlysia({
  config: {
    autoRedact: true,
    transports: [withRedaction(axiom, Redact.load)]
  }
})
```
