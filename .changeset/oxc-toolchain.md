---
'logixlysia': patch
---

Internal cleanup from moving the repo's lint and format tooling from Biome to oxlint + oxfmt. Runtime behaviour and exported names are unchanged. `resolveSampling`'s first parameter is now optional, so `resolveSampling()` compiles, and calls that pass `undefined` still do. Promise chains inside the batch queue, file sink and shutdown flush became `async` helpers that run their work in the same order. Deferred promises use `Promise.withResolvers`, which is within the Node.js 22 floor that chalk 6 already set.
