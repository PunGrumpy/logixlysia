---
name: createElogs
description: Coding guidelines, API usage, and configuration standards for using the Elogs logger plugin in Elysia.js applications.
---

# Elogs API & Coding Standards

Elogs is an opinionated, high-performance logger plugin for **Elysia.js** applications. It provides request-scoped logging, structured logging via **Pino**, context propagation, automatic PII redaction, and WebSocket tracing.

---

## 1. Installation and Basic Setup

To register Elogs in an Elysia application:

```typescript
import { Elysia } from 'elysia'
import { createElogs } from 'createElogs'

const app = new Elysia()
  .use(createElogs()) // Register with default options
  .get('/', () => 'Hello Elysia')
  .listen(3000)
```

---

## 2. Request-Scoped Logging

Elogs derives a `log` object (of type `RequestScopedLogger`) onto the Elysia request context. Always prefer using this request-scoped logger inside route handlers instead of importing global loggers, as it tracks timing, request paths, and request-specific context.

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
  createElogs({
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
import { useLogger } from 'createElogs'

export const fetchFromDatabase = async (userId: string) => {
  const log = useLogger() // Fetches the logger for the current async execution context
  log?.info('Querying database', { userId })

  // Database logic...
}
```

---

## 5. WebSocket Integration

To enable request-scoped tracing and logging in WebSockets, wrap your WebSocket handler hooks using `wrapWs`. This allows logging lifecycle events like connections, message exchanges, and closures.

```typescript
import { Elysia } from 'elysia'
import { createElogs } from 'createElogs'

const logger = createElogs()

const app = new Elysia()
  .use(logger)
  .ws('/ws', logger.wrapWs({
    open(ws) {
      ws.data.log.info('WebSocket connection opened')
    },
    message(ws, message) {
      ws.data.log.info('Message received', { payload: message })
    },
    close(ws, code, reason) {
      ws.data.log.info('WebSocket closed', { code, reason })
    }
  }))
```

---

## 6. Code Standards and Constraints

When writing or modifying code relating to Elogs:
1. **Never use `any`** for context arguments. Leverage the `RequestScopedLogger` and `ElogsContext` interfaces.
2. **Prefer explicit return types** for custom logging utilities and transport implementations.
3. **Empty Singleton Slots Constraint**: If writing middleware or plugins that extend Elysia context slots, avoid returning `Record<string, never>`. Use a dedicated empty interface like:
   ```typescript
   export interface EmptyElysiaSlot {
     readonly __elogsEmpty?: never
   }
   ```
   to prevent context properties from narrowing to `never`.
4. **Clean up listeners**: When setting up file logging, always clean up or close writable streams during shutdown hook hooks (`onStop` lifecycle).
