---
'logixlysia': patch
---

Import logixlysia faster and install a smaller package. `pino` and `pino-pretty` now load the first time something needs them, so a config without `config.pino` and without `store.pino` use never pays for them. `store.pino` and `createLogger` behave as before. The published files no longer embed inline sourcemaps, which cuts the packed tarball from about 233 kB to about 78 kB.
