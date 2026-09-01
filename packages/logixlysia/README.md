<div align="center">
  <h1><code>🦊</code> Logixlysia</h1>
  <strong>Logixlysia is a logging library for ElysiaJS</strong>
  <img src="https://github.com/PunGrumpy/logixlysia/blob/main/apps/docs/public/opengraph-image.png?raw=true" alt="Logixlysia" width="100%" height="auto" />
</div>

## `📩` Installation

This is the **Elysia 2 open beta** line, published under the `next` dist-tag:

```bash
bun add logixlysia@next elysia@next
```

Still on Elysia 1.4? Use the `latest` tag (`bun add logixlysia`), which stays on Logixlysia 6.x.
See [Elysia 2 support](https://logixlysia.vercel.app/docs/elysia-2) for the full compatibility matrix.

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

## `📚` Documentation

Check out the [website](https://logixlysia.vercel.app) for more detailed documentation and examples.

## `📄` License

Licensed under the [MIT License](LICENSE).