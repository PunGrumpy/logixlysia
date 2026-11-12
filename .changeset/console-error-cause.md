---
'logixlysia': patch
---

Show the `cause` chain of a logged error in the console. Each cause prints under the error as `Caused by: <name>: <message>`, up to three levels deep, with the same redaction as the error message. Transports already received the cause and are unchanged.
