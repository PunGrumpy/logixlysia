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
import { logger } from 'logixlysia'

const app = new Elysia({
  name: 'Logixlysia Example'
}).use(logger())

console.log(
  `🧪 Listening on http://${app.server!.hostname}:${app.server!.port}`
)
```

## `📄` License

Licensed under the [MIT License](LICENSE).
