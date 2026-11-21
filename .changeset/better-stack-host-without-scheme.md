---
'logixlysia': patch
---

`createBetterStackTransport()` now accepts an ingesting host without a scheme in `BETTER_STACK_INGESTING_HOST` and in `endpoint`, and sends to it over `https`. Before, a bare host such as `s123456.eu-nbg-2.betterstackdata.com` made the adapter throw `invalid endpoint URL` at startup.
