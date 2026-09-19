<div align="center">
  <h1><code>🦊</code> Logixlysia</h1>
  <strong>Logixlysia is a logging library for ElysiaJS</strong>
  <img src="https://github.com/PunGrumpy/logixlysia/blob/main/apps/docs/public/opengraph-image.png?raw=true" alt="Logixlysia" width="100%" height="auto" />
</div>

## `📩` Installation

```bash
bun add logixlysia
```

## `📝` Usage

```ts
import { Elysia } from 'elysia'
import logixlysia from 'logixlysia' // or import { logixlysia } from 'logixlysia'

const app = new Elysia({
    name: "Elysia with Logixlysia"
})
  .use(
    logixlysia({
      config: {
        service: 'api-server',
        showStartupMessage: true,
        startupMessageFormat: 'banner',
        showContextTree: true,
        contextDepth: 2,
        slowThreshold: 500,
        verySlowThreshold: 1000,
        timestamp: {
          translateTime: 'yyyy-mm-dd HH:MM:ss.SSS'
        },
        ip: true
        }
    }))
    .get('/', () => {
        return { message: 'Welcome to Basic Elysia with Logixlysia' }
    })
        
app.listen(3000)
```

## `✨` Features

- **Request context**: accumulate fields with `mergeContext` into a context tree. [Docs](https://logixlysia.vercel.app/docs/features/request-context)
- **Presets**: `dev`, `prod`, and `json` output. [Docs](https://logixlysia.vercel.app/docs/configuration)
- **File logging**: writes to disk with rotation by size, age, or count. [Docs](https://logixlysia.vercel.app/docs/features/file-logging)
- **Adapters**: nine built-in destinations, Axiom, Better Stack, ClickHouse, Datadog, HyperDX, Loki, OTLP, PostHog, and Sentry. [Docs](https://logixlysia.vercel.app/docs/adapters/overview)
- **Sampling**: head and tail sampling controls log volume. [Docs](https://logixlysia.vercel.app/docs/features/sampling)
- **Enrichers**: add trace, user agent, geo, and size fields to every request. [Docs](https://logixlysia.vercel.app/docs/features/enrichers)
- **Redaction**: `autoRedact` masks PII by pattern; `logixlysia/desertant` adds neural redaction. [Config docs](https://logixlysia.vercel.app/docs/configuration#autoredact), [Neural redaction docs](https://logixlysia.vercel.app/docs/integrations/desertant)
- **Structured errors**: `HttpError` carries `why`, `fix`, and `link`. [Docs](https://logixlysia.vercel.app/docs/api-reference)
- **Request IDs**: read from the incoming request or generated for every request. [Docs](https://logixlysia.vercel.app/docs/features/request-id)
- **OpenTelemetry**: trace correlation and AI usage metrics on the access log. [Docs](https://logixlysia.vercel.app/docs/integrations/otel)
- **WebSocket logging**: lifecycle logs via `wrapWs`. [Docs](https://logixlysia.vercel.app/docs/features/websocket)

## `📚` Documentation

Check out the [website](https://logixlysia.vercel.app) for more detailed documentation and examples.

## `📄` License

Licensed under the [MIT License](LICENSE).