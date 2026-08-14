<div align="center">
  <h1><code>🦊</code> Logixlysia</h1>
  <strong>High-performance logging for Elysia — Pino-backed, Elysia 2 native</strong>
  <img src="https://github.com/PunGrumpy/logixlysia/blob/main/apps/docs/app/opengraph-image.png?raw=true" alt="Logixlysia" width="100%" height="auto" />
</div>

## `📩` Installation

```bash
bun add @pori15/logixlysia elysia@next
```

`elysia@next` 对应 [Elysia 2](https://elysiajs.com/integrate/elysia-2.html)。如果你还在 Elysia 1.4,用 1.x 的 `logixlysia`(`latest` 标签)。

## `📝` Usage

```ts
import { Elysia } from 'elysia'
import { logixlysia } from '@pori15/logixlysia'

const app = new Elysia()
  .use(logixlysia())
  .get('/', () => 'Hello World')
  .listen(3000)
```

`logixlysia()` 返回一个 Elysia plugin ——`Logger` 挂在 `store.logger`,请求作用域的 `log` 派生到 handler context。自动注册 `.request`、`.afterHandle`、`.error` 和 `.setup` 钩子,你不用手动接线。

### With configuration

```ts
app.use(logixlysia({
  preset: 'prod',
  config: {
    service: 'my-api',
    showStartupMessage: true,
    customLogFormat: '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}',
    logFilePath: './logs/example.log',
    logRotation: {
      maxSize: '10m',
      interval: '1d',
      maxFiles: '7d',
      compress: true,
    },
    logFilter: { level: ['ERROR', 'WARNING'] },
    pino: { redact: ['password', 'token', 'apiKey'] },
  },
}))
```

完整字段见 [Configuration](https://logixlysia.vercel.app/docs/configuration)。预设见 [Presets](https://logixlysia.vercel.app/docs/features/presets)。

### WebSocket logging

WebSocket 生命周期走独立的 `createWsHandlerWrapper`(Elysia 2 的 `#private` brand 不让 plugin 实例上挂额外字段):

```ts
import { Elysia } from 'elysia'
import { logixlysia, createWsHandlerWrapper } from '@pori15/logixlysia'

const wrapWs = createWsHandlerWrapper()

new Elysia()
  .use(logixlysia())
  .ws('/chat', wrapWs({
    open(ws) { ws.send('connected') },
    message(ws, payload) { ws.send(payload) },
  }))
```

## `⚙️` Plugins & integrations

- **`mergeAIMetrics`** — `logixlysia/ai` 把 AI SDK 用量挂到 access log 的 `context.ai`
- **`injectTraceContext`** — `logixlysia/otel` 把 active span 的 `trace_id` / `span_id` 合并进请求 context

## `📚` Documentation

完整文档:[logixlysia.vercel.app](https://logixlysia.vercel.app)

- [Usage](https://logixlysia.vercel.app/docs/usage)
- [Configuration](https://logixlysia.vercel.app/docs/configuration)
- [WebSocket](https://logixlysia.vercel.app/docs/features/websocket)
- [Pino integration](https://logixlysia.vercel.app/docs/integrations/pino)
- [OpenTelemetry](https://logixlysia.vercel.app/docs/integrations/otel)
- [AI SDK](https://logixlysia.vercel.app/docs/integrations/ai)

## `📄` License

Licensed under the [MIT License](LICENSE).
