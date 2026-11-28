---
'logixlysia': minor
---

`runJob(name, fn, { successLine: false })` writes no final line for a job that returns, so a job that runs often can report failures only. A job that throws still gets its error line, and lines the job logs itself are written as before. The option's type is exported as `RunJobOptions`.
