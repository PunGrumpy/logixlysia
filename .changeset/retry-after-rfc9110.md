---
'logixlysia': patch
---

Adapters read `Retry-After` by RFC 9110's grammar. Only a bare digit string is delta-seconds, so `1e3` and `0x10` no longer read as 1 s and 0 s, and `+5` and `5.5` no longer read as 5 s. An HTTP-date already in the past is ignored instead of retrying with no delay. Either way the adapter falls back to its jittered backoff.
