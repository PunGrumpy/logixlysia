---
'logixlysia': patch
---

With `pino.prettyPrint` on and no `pino.transport`, lines written through `store.pino` now show a `timestamp.translateTime` pattern the same way the text console line does. Before, `SSS` printed as letters, a pattern without a prefix was rendered in UTC, letters between tokens were replaced, and `UTC:standard` printed nonsense. Two tokens side by side, such as `mmmm`, are read as two tokens, and a pattern that is only a prefix (`SYS:`) leaves the time empty on both lines (the pino line shows `[]`). `standard` is accepted in any letter case (`SYS:STANDARD`) on both lines; on the pino line it keeps pino-pretty's own form, which ends with the zone offset. A `translateTime` set inside `pino.prettyPrint` is unchanged.
