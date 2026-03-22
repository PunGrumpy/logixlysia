---
'logixlysia': minor
---

- Add `formatLogOutput` with optional multi-line context tree; keep `formatLine` as a deprecated alias returning the main line only.
- New config: `service`, `slowThreshold`, `verySlowThreshold`, `showContextTree`, `contextDepth`; default format includes `{icon}`, `{service}`, `{statusText}`, and `{speed}` tokens.
- Startup banner shows URL and optional logixlysia package version in a boxed layout.
