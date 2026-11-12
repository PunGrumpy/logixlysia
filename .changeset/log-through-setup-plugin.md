---
'logixlysia': patch
---

`log` is now defined in handlers of an app that mounts logixlysia through a shared setup plugin (`new Elysia({ name: 'setup' }).use(logixlysia())`), at any depth. Before, TypeScript showed `log` but the handler threw `undefined is not an object` and the request answered 500. The same holds for `group` and `guard` routes, `onError` handlers and `ws.data.log` in WebSocket handlers. A module that mounts its own instance still gets that instance's `log`, and each request is still logged once.
