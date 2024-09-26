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
      showStartupMessage: true,
      startupMessageFormat: 'simple',
      ip: true,
      logFilePath: './logs/example.log',
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

> [!NOTE]
> You can discover more about example in the [example](example) directory.

## `📚` Documentation

### Options

| Option                 | Type                     | Description                                                           | Default                                                                   |
| ---------------------- | ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `showStartupMessage`   | `boolean`                | Display the startup message                                           | `true`                                                                    |
| `startupMessageFormat` | `"banner"` \| `"simple"` | Choose the startup message format                                     | `"banner"`                                                                |
| `ip`                   | `boolean`                | Display the incoming IP address based on the `X-Forwarded-For` header | `false`                                                                   |
| `customLogMessage`     | `string`                 | Custom log message to display                                         | `🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}` |
| `logFilter`            | `object`                 | Filter the logs based on the level, method, and status                | `null`                                                                    |
| `logFilePath`          | `string`                 | Path to the log file                                                  | `./logs/elysia.log`                                                       |

### Custom Log Message

| Placeholder  | Description                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| `{now}`      | Current date and time in `YYYY-MM-DD HH:mm:ss` format                       |
| `{level}`    | Log level (`INFO`, `WARNING`, `ERROR`)                                      |
| `{duration}` | Request duration in milliseconds                                            |
| `{method}`   | Request method (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`) |
| `{pathname}` | Request pathname                                                            |
| `{status}`   | Response status code                                                        |
| `{message}`  | Custom message                                                              |
| `{ip}`       | Incoming IP address                                                         |
| `{epoch}`    | Current date and time in Unix epoch format (seconds since January 1, 1970   |

## `📄` License

Licensed under the [MIT License](LICENSE).
