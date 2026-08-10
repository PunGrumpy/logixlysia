---
'logixlysia': patch
---

Internal type reorganization: the config object is now composed of named sub-interfaces (`FormattingConfig`, `OutputConfig`, `RedactionConfig`, …) behind the same `Options` shape; `HttpError` moved to a dedicated module. All public import paths and names are unchanged.
