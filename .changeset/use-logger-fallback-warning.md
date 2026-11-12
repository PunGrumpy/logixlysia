---
'logixlysia': patch
---

`useLogger()` now prints one warning to stderr the first time it falls back to a logger that writes nothing because the plugin was created without `useAsyncLocalStorage: true`. The warning names the option. It never prints in production (`NODE_ENV === 'production'`) or when any plugin has the option on. The fallback logger behaves as before.
