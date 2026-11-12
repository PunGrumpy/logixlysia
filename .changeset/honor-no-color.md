---
'logixlysia': patch
---

Honor the `NO_COLOR` environment variable. When it is set to a non-empty value, the console line is printed without colors on an interactive terminal too, as it is with `useColors: false`, and the pino pretty stream stops colorizing.
