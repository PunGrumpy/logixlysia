# Pino Integration in Logixlysia

This document describes the Pino integration feature added to Logixlysia, which replaces the basic logging system with [Pino](https://github.com/pinojs/pino), a high-performance, JSON-first logging library.

## Features

- **High Performance**: Pino is one of the fastest Node.js loggers available
- **Structured Logging**: JSON-first approach for better log parsing and analysis
- **Direct Pino Access**: Access the underlying Pino logger instance in your routes
- **Backward Compatibility**: Existing logixlysia logging methods continue to work
- **Configurable**: Full Pino configuration support through options

## Installation

Pino and pino-pretty are included as dependencies:

```bash
npm install logixlysia
# Pino and pino-pretty are automatically installed
```

## Basic Usage

```typescript
import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

const app = new Elysia()
  .use(
    logixlysia({
      config: {
        pino: {
          level: 'info',
          prettyPrint: true // Enable pretty printing for development
        }
      }
    })
  )
  .get('/', ({ store }) => {
    const { logger, pino } = store
    
    // Using logixlysia logger (now powered by Pino)
    logger.info(request, 'Hello from logixlysia!')
    
    // Direct Pino access for advanced logging
    pino.info({ userId: 123, action: 'home' }, 'User accessed home page')
    
    return { message: 'Hello World!' }
  })
```

## Configuration

Configure Pino through the `config.pino` option:

```typescript
logixlysia({
  config: {
    pino: {
      level: 'debug',              // Log level
      prettyPrint: true,           // Pretty print for development
      timestamp: true,             // Include timestamp
      messageKey: 'msg',           // Message field name
      errorKey: 'err',             // Error field name
      redact: ['password', 'token'], // Redact sensitive fields
      base: { service: 'my-app' }, // Base fields for all logs
      
      // Transport configuration (for pretty printing, file output, etc.)
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    }
  }
})
```

## Direct Pino Logger Access

The Pino logger instance is available in your route handlers through the store:

```typescript
app.get('/users/:id', ({ store, params }) => {
  const { pino } = store
  const userId = params.id

  // Create child logger with context
  const userLogger = pino.child({ userId, module: 'user-service' })
  
  userLogger.info('Fetching user profile')
  userLogger.debug({ query: 'SELECT * FROM users WHERE id = ?', params: [userId] })
  
  // Log with structured data
  pino.info({
    userId,
    action: 'profile_view',
    timestamp: Date.now(),
    metadata: {
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for')
    }
  }, 'User profile accessed')

  return { userId, name: `User ${userId}` }
})
```

## Structured Logging Examples

### Performance Logging
```typescript
app.get('/api/heavy-operation', ({ store }) => {
  const { pino } = store
  const startTime = Date.now()

  // Simulate heavy operation
  performHeavyOperation()

  pino.info({
    operation: 'heavy_operation',
    duration: Date.now() - startTime,
    memory: process.memoryUsage().heapUsed / 1024 / 1024,
    cpu: process.cpuUsage()
  }, 'Heavy operation completed')
})
```

### Error Logging
```typescript
app.get('/api/risky-operation', ({ store }) => {
  const { pino } = store

  try {
    riskyOperation()
  } catch (error) {
    pino.error({
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code
      },
      context: {
        operation: 'risky_operation',
        userId: getCurrentUserId(),
        timestamp: new Date().toISOString()
      }
    }, 'Risky operation failed')
    
    throw error
  }
})
```

### Request Tracing
```typescript
app.use((ctx) => {
  const { pino } = ctx.store
  const traceId = generateTraceId()
  
  // Create request-scoped logger
  ctx.store.requestLogger = pino.child({ traceId, requestId: generateRequestId() })
  
  return ctx
})

app.get('/api/traced', ({ store }) => {
  const { requestLogger } = store
  
  requestLogger.info('Processing traced request')
  requestLogger.debug({ step: 1 }, 'Validating input')
  requestLogger.debug({ step: 2 }, 'Fetching data')
  requestLogger.info({ step: 3, duration: '50ms' }, 'Request completed')
})
```

## Migration from Previous Versions

The existing logixlysia API remains unchanged:

```typescript
// This continues to work as before
logger.info(request, 'Message', { context: 'data' })
logger.error(request, 'Error occurred', { userId: 123 })
logger.warn(request, 'Warning message')
logger.debug(request, 'Debug info')
```

But now you also have access to the powerful Pino logger:

```typescript
// New Pino capabilities
pino.info({ structured: 'data' }, 'Message')
pino.child({ userId: 123 }).info('User-specific log')
```

## Best Practices

1. **Use Structured Logging**: Take advantage of Pino's JSON structure
   ```typescript
   // Good
   pino.info({ userId, action, duration }, 'User action completed')
   
   // Less optimal
   pino.info(`User ${userId} completed ${action} in ${duration}ms`)
   ```

2. **Create Child Loggers**: Use child loggers for context-specific logging
   ```typescript
   const userLogger = pino.child({ userId, module: 'auth' })
   userLogger.info('User authenticated')
   ```

3. **Log Performance Metrics**: Include timing and resource usage
   ```typescript
   pino.info({
     duration: endTime - startTime,
     memory: process.memoryUsage().heapUsed,
     cpu: process.cpuUsage()
   }, 'Operation completed')
   ```

4. **Use Appropriate Log Levels**:
   - `debug`: Detailed information for debugging
   - `info`: General information about application flow
   - `warn`: Warning messages that don't stop execution
   - `error`: Error conditions that should be investigated

## Environment Configuration

For production environments:

```typescript
logixlysia({
  config: {
    pino: {
      level: process.env.LOG_LEVEL || 'info',
      prettyPrint: process.env.NODE_ENV !== 'production',
      redact: ['password', 'token', 'apiKey', 'secret']
    }
  }
})
```

## Log Output Examples

### Pretty Print (Development)
```
[2024-01-15 10:30:45.123] INFO: User profile accessed
    userId: 123
    action: "profile_view"
    duration: 45
    userAgent: "Mozilla/5.0..."
```

### JSON (Production)
```json
{
  "level": 30,
  "time": 1705315845123,
  "pid": 12345,
  "hostname": "server-01",
  "userId": 123,
  "action": "profile_view",
  "duration": 45,
  "userAgent": "Mozilla/5.0...",
  "msg": "User profile accessed"
}
```

## Performance Benefits

- **Faster Logging**: Pino is significantly faster than console.log
- **Asynchronous**: Non-blocking logging operations
- **Memory Efficient**: Optimized for high-throughput applications
- **Structured**: Better for log aggregation and analysis tools

This integration maintains backward compatibility while providing access to Pino's advanced logging capabilities, making your application logs more structured, performant, and analysis-friendly.