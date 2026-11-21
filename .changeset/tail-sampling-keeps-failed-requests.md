---
'logixlysia': minor
---

With `sampling.tail.status` set, a request that ended in an error logged at `ERROR` now counts as a `500` for that comparison when the client got a status below `400`. A generator or SSE response that failed after a `2xx` status and its first chunk went out, or an error an `onError` hook answered with a redirect, keeps its sampled-away lines under a threshold of `500` or less. `tail.keep` receives a new `error` field with the value that was thrown, except for a thrown `status()` result, which is a response. Which lines are kept does not change for a request whose client got `400` or more, or for a thrown `status()` result.
