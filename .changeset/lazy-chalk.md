---
'logixlysia': patch
---

Importing the plugin no longer loads `chalk`. It loads when a text logger is created on a terminal, so a server without one, or one that logs JSON, never pays for it. Colors, and when they turn on, are unchanged. Measured on the built package after Elysia is loaded: 19.2 ms to 14.3 ms under Bun, 14.0 ms to 8.1 ms under Node. On Node before 22.12, which cannot `require` an ES module, terminal lines are no longer colored.
