---
'logixlysia': minor
---

Print the log level as a word when console colors are off. With `useColors: false` or a stdout that is not a TTY, the `{icon}` token in the default line now reads `DEBUG`, `INFO`, `WARN` or `ERROR`, padded to five characters so the method column lines up, in place of the `🦊` emoji that looked the same for every level. A color terminal still shows the fox in a level-colored chip.
