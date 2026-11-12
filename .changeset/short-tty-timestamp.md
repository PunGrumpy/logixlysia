---
'logixlysia': minor
---

Shorten the console line on a terminal and stop printing an error message twice.

- When stdout is a TTY and you set neither `timestamp` nor `customLogFormat`, `{now}` prints local `HH:MM:ss.SSS` (`09:05:07.042`) in place of the full ISO date. Piped output, CI and Docker logs keep the ISO timestamp, and any `timestamp` or `customLogFormat` you set keeps working as before.
- A failed request no longer repeats its message as an `error` row in the tree when the main line already ends with it. The row still appears when your format leaves out `{message}` or the logged message differs from the error's.
