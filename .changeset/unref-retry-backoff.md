---
'logixlysia': patch
---

Fixed an adapter waiting out a retry backoff, including a `Retry-After` delay of up to 30 seconds, keeping the process alive on its own. A pending retry no longer delays exit, matching the queue's flush timer.
