---
'logixlysia': patch
---

A streamed or SSE response is now logged when the client disconnects, even while the generator is waiting for its next value. Since 6.10.0 such a request got no line until that wait ended, which for an SSE loop could be never. A generator whose cleanup throws is logged as an error whether the body was cancelled before or after its first read.
