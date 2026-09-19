---
'logixlysia': patch
---

Console method colours work again: the method was padded before the colour lookup, so every method except `OPTIONS` and `CONNECT` rendered in the fallback white.
