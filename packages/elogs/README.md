<div align="center">
  <h1><code>🦊</code> Elogs</h1>
  <strong>High-performance logging for Elysia — Pino-backed, Elysia 2 native</strong>
  <img src="https://github.com/PunGrumpy/createElogs/blob/main/apps/docs/app/opengraph-image.png?raw=true" alt="Elogs" width="100%" height="auto" />
</div>

## `📩` Installation

```bash
bun add @pori15/elogs elysia@next
```

`elysia@next` 对应 [Elysia 2](https://elysiajs.com/integrate/elysia-2.html)。如果你还在 Elysia 1.4,用 1.x 的 `createElogs`(`latest` 标签)。

## `📝` Usage

```ts
import { Elysia } from 'elysia'
import { createElogs } from '@pori15/elogs'

const app = new Elysia()
  .use(createElogs())
  .get('/', () => 'Hello World')
  .listen(3000)
```

`createElogs()` 返回一个 Elysia plugin ——`Logger` 挂在 `store.logger`,请求作用域的 `log` 派生到 handler context。自动注册 `.request`、`.afterHandle`、`.error` 和 `.setup` 钩子,你不用手动接线。

### With configuration

```ts
app.use(createElogs({
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

完整字段见 [Configuration](https://elogs.vercel.app/docs/configuration)。预设见 [Presets](https://elogs.vercel.app/docs/features/presets)。

### WebSocket logging

WebSocket 生命周期走独立的 `createWsHandlerWrapper`(Elysia 2 的 `#private` brand 不让 plugin 实例上挂额外字段):

```ts
import { Elysia } from 'elysia'
import { createElogs, createWsHandlerWrapper } from '@pori15/elogs'

const wrapWs = createWsHandlerWrapper()

new Elysia()
  .use(createElogs())
  .ws('/chat', wrapWs({
    open(ws) { ws.send('connected') },
    message(ws, payload) { ws.send(payload) },
  }))
```

## `⚙️` Plugins & integrations

- **`mergeAIMetrics`** — `createElogs/ai` 把 AI SDK 用量挂到 access log 的 `context.ai`
- **`injectTraceContext`** — `createElogs/otel` 把 active span 的 `trace_id` / `span_id` 合并进请求 context

## `📚` Documentation

完整文档:[elogs.vercel.app](https://elogs.vercel.app)

- [Usage](https://elogs.vercel.app/docs/usage)
- [Configuration](https://elogs.vercel.app/docs/configuration)
- [WebSocket](https://elogs.vercel.app/docs/features/websocket)
- [Pino integration](https://elogs.vercel.app/docs/integrations/pino)
- [OpenTelemetry](https://elogs.vercel.app/docs/integrations/otel)
- [AI SDK](https://elogs.vercel.app/docs/integrations/ai)

## `📄` License

Licensed under the [MIT License](LICENSE).
