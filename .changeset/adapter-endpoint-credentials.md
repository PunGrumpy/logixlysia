---
'logixlysia': patch
---

Adapter endpoint URLs that carry credentials (`http://user:pass@host`) are now rejected when the transport is created. `fetch` drops them instead of sending them, so the backend answered 401, and its network errors carry the full URL, so the password reached `onError` and the console. Pass credentials through the adapter's options, such as `username` and `password` for ClickHouse and Loki.

The OTLP and HyperDX transports now send a whole number outside the safe-integer range as `doubleValue`. As `intValue` it became a string such as `"1e+21"` that the collector cannot parse as an int64, which failed the whole request.
