<div align="center">
  <h1><code>🦊</code> Logixlysia</h1>
  <strong>Logixlysia is a logging library for ElysiaJS</strong>
  <img src="./.github/images/screenshot.png" alt="Screenshot of Logixlysia" width="100%" height="auto" />
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
      ip: true,
      logFilePath: './logs/example.log',
      customLogFormat:
        '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}',
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

### Options

| Option             | Type      | Description                                                           | Default                                                                   |
| ------------------ | --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `ip`               | `boolean` | Display the incoming IP address based on the `X-Forwarded-For` header | `false`                                                                   |
| `customLogMessage` | `string`  | Custom log message to display                                         | `🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}` |
| `logFilter`        | `object`  | Filter the logs based on the level, method, and status                | `null`                                                                    |
| `logFilePath`      | `string`  | Path to the log file                                                  | `./logs/elysia.log`                                                       |

## `📄` License

Licensed under the [MIT License](LICENSE).
