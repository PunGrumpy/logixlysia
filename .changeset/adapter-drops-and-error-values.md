---
'logixlysia': patch
---

Adapters without an `onError` hook now report every dropped entry on stderr. Previously a drop count that fell inside the 5-second rate limit was discarded, so during an outage stderr showed one small count and then only the failures. An `Error`, `Map` or `Set` in a record's context now reaches the backend with its content (an error's name, message, cause and own fields, a map as an object, a set as an array) instead of as `{}`, and the console's `{context}` text shows the same.
