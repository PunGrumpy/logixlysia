<div align="center">
  <h1><code>🦊</code> Logixlysia</h1>
  <strong>High-performance logging for Elysia — Pino-backed, Elysia 2 native</strong>
  <img src="https://github.com/PunGrumpy/createLogPlugin/blob/main/apps/docs/app/opengraph-image.png?raw=true" alt="Logixlysia" width="100%" height="auto" />
</div>

## `📩` Installation

```bash
bun add @pori15/createLogPlugin elysia@next
```

`elysia@next` 对应 [Elysia 2](https://elysiajs.com/integrate/elysia-2.html)。如果你还在 Elysia 1.4,用 1.x 的 `createLogPlugin`(`latest` 标签)。

## `📝` Usage

```ts
import { Elysia } from 'elysia'
import { createLogPlugin } from '@pori15/createLogPlugin'

const app = new Elysia()
  .use(createLogPlugin())
  .get('/', () => 'Hello World')
  .listen(3000)
```

`createLogPlugin()` 返回一个 Elysia plugin ——`Logger` 挂在 `store.logger`,请求作用域的 `log` 派生到 handler context。自动注册 `.request`、`.afterHandle`、`.error` 和 `.setup` 钩子,你不用手动接线。

### With configuration

```ts
app.use(createLogPlugin({
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

完整字段见 [Configuration](https://createLogPlugin.vercel.app/docs/configuration)。预设见 [Presets](https://createLogPlugin.vercel.app/docs/features/presets)。

### WebSocket logging

WebSocket 生命周期走独立的 `createWsHandlerWrapper`(Elysia 2 的 `#private` brand 不让 plugin 实例上挂额外字段):

```ts
import { Elysia } from 'elysia'
import { createLogPlugin, createWsHandlerWrapper } from '@pori15/createLogPlugin'

const wrapWs = createWsHandlerWrapper()

new Elysia()
  .use(createLogPlugin())
  .ws('/chat', wrapWs({
    open(ws) { ws.send('connected') },
    message(ws, payload) { ws.send(payload) },
  }))
```

## `⚙️` Plugins & integrations

- **`mergeAIMetrics`** — `createLogPlugin/ai` 把 AI SDK 用量挂到 access log 的 `context.ai`
- **`injectTraceContext`** — `createLogPlugin/otel` 把 active span 的 `trace_id` / `span_id` 合并进请求 context

## `📚` Documentation

完整文档:[createLogPlugin.vercel.app](https://createLogPlugin.vercel.app)

- [Usage](https://createLogPlugin.vercel.app/docs/usage)
- [Configuration](https://createLogPlugin.vercel.app/docs/configuration)
- [WebSocket](https://createLogPlugin.vercel.app/docs/features/websocket)
- [Pino integration](https://createLogPlugin.vercel.app/docs/integrations/pino)
- [OpenTelemetry](https://createLogPlugin.vercel.app/docs/integrations/otel)
- [AI SDK](https://createLogPlugin.vercel.app/docs/integrations/ai)

## `📄` License

Licensed under the [MIT License](LICENSE).
