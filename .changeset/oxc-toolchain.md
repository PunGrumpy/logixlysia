---
'logixlysia': patch
---

Internal cleanup from moving the repo's lint and format tooling from Biome to oxlint + oxfmt. Exported names and types are unchanged, apart from `resolveSampling`'s first parameter becoming optional, so `resolveSampling()` compiles and calls that pass `undefined` still do.

- Promise chains inside the batch queue, file sink and shutdown flush became `async` helpers that run their work in the same order.
- Deferred promises use `Promise.withResolvers`, so the package now declares `engines.node >=22`, the floor chalk 6 already set.
- Every regular expression carries the `u` flag. Two matches move on unusual input: the user-agent enricher's case-insensitive patterns also fold `ſ` (U+017F) to `s` and the Kelvin sign to `k`, and a `?` in a sampling glob matches one code point rather than one UTF-16 unit, which only differs for a decoded path containing an astral character such as an emoji.
