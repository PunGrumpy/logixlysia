---
'logixlysia': patch
---

When tail sampling buffers a record that carries a `durationOverride`, the buffered record now keeps that override, as the write path already did. The plugin's own replay never buffers such a record, so app logs are unchanged.
