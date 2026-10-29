---
'logixlysia': patch
---

The OTLP and HyperDX transports now send a whole number outside the safe-integer range as `doubleValue`. As `intValue` it became a string such as `"1e+21"` that the collector cannot parse as an int64, which failed the whole request.
