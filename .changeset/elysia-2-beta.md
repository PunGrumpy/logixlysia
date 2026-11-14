---
'logixlysia': minor
---

The plugin now runs on the Elysia 2 prereleases (`2.0.0-beta.32` and later) as well as on Elysia 1.4, and the `elysia` peer range accepts both. On Elysia 2 it mounts with the scope 2.x names `plugin`, reads a handler's result from `responseValue`, recognises a `status()` result by its new shape, times an `sse()` body that Elysia hands over before its first read, keeps one instance's logger and pino out of a sibling instance's state, and gives the plugin instance a `store` so `plugin.store.pino` still works. A validation error's `failedPaths` stay JSON Pointers on both lines, and `logErrorPayload` logs the payload Elysia 2 no longer puts in the message. The types still describe Elysia 1.4.
