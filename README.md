<div align="center">
  <h1><code>🦊</code> Logixlysia</h1>
  <strong>Logixlysia is a logging library for ElysiaJS</strong>
  <img src="./website/app/opengraph-image.png" alt="Logixlysia" width="100%" height="auto" />
</div>

## `📩` Installation

```bash
bun add logixlysia
```

## `📝` Usage

```ts
import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

const app = new Elysia({
  name: 'Logixlysia Example'
}).use(
  logixlysia({
    config: {
      showStartupMessage: true,
      startupMessageFormat: 'simple',
      timestamp: {
        translateTime: 'yyyy-mm-dd HH:MM:ss'
      },
      ip: true,
      logFilePath: './logs/example.log',
      logRotation: {
        maxSize: '10m',
        interval: '1d',
        maxFiles: '7d',
        compress: true
      },
      customLogFormat:
        '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip} {epoch}',
      logFilter: {
        level: ['ERROR', 'WARNING'],
        status: [500, 404],
        method: 'GET'
      }
    }
  })
)

app.listen(3000)
```

## `📚` Documentation

Check out the [website](https://logixlysia.vercel.app) for more detailed documentation and examples.

## `📄` License

Licensed under the [MIT License](LICENSE).
