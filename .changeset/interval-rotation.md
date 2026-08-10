---
'logixlysia': minor
---

`logRotation.interval` now actually rotates. The live file's age (from
filesystem creation time, falling back to open time where the filesystem
reports none) is checked after every write, and the file rotates on the
first write after the interval elapses — no timers, so an idle process
rotates on its next write rather than on a wall-clock schedule. When both
`maxSize` and `interval` are set, whichever trigger is crossed first
rotates. Previously `interval` was accepted and format-validated but
never triggered rotation; configs that already set it will begin rotating
on upgrade.
