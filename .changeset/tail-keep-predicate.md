---
'logixlysia': minor
---

`sampling.tail.keep` takes a predicate that receives the finished request's `durationMs`, `pathname`, `status` and `context`, so tail sampling can rescue by anything the handler learned. A predicate that throws counts as no match and is reported through `onError` with `sink: 'sampling'`. `RequestOutcome` gains a required `context` field.
