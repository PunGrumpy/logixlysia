---
'logixlysia': minor
---

`plugin.runJob(name, fn)` runs a cron job, queue consumer or script outside a request and writes one final `JOB` line for it, with duration, outcome and accumulated context, through every sink. It returns `fn`'s value, logs a thrown error with status 500 and rethrows it, and makes `useLogger()` work inside `fn` without `useAsyncLocalStorage`.
