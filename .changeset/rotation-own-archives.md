---
'logixlysia': patch
---

Rotation retention now deletes only the log's own archives. A file counted as an archive of `app` whenever its name started with `app.` and ended in a rotation timestamp, so with `maxFiles` set, rotating `logs/app` deleted the archives of `logs/app.error` in the same directory, and user files such as `app.bak.<timestamp>`. The whole suffix after the log's name must now be the timestamp.
