<div align="center">
  <h1><code>🦊</code> Logixlysia</h1>
  <strong>Logixlysia is a logging library for ElysiaJS</strong>
  <img src="https://github.com/PunGrumpy/logixlysia/blob/main/apps/docs/app/opengraph-image.png?raw=true" alt="Logixlysia" width="100%" height="auto" />
</div>

## `📩` Installation

```bash
bun add logixlysia
```

## `📝` Usage

```ts
import { Elysia } from "elysia";
import logixlysia from "logixlysia"; // or import { logixlysia } from 'logixlysia'

const app = new Elysia({
  name: "Elysia with Logixlysia",
})
  .use(
    logixlysia({
      config: {
        showStartupMessage: true,
        startupMessageFormat: "simple",
        timestamp: {
          translateTime: "yyyy-mm-dd HH:MM:ss.SSS",
        },
        logFilePath: "./logs/example.log",
        ip: true,
        customLogFormat:
          "🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}",
      },
    })
  )
  .get("/", () => {
    return { message: "Welcome to Basic Elysia with Logixlysia" };
  });

app.listen(3000);
```

## `📚` Documentation

Check out the [website](https://logixlysia.vercel.app) for more detailed documentation and examples.

## `📄` License

Licensed under the [MIT License](LICENSE).
