---
'logixlysia': patch
---

An invalid glob in `logFilter.accessLine.include`, `logFilter.accessLine.exclude` or `sampling.tail.paths` stopped the app with a bare `Invalid glob pattern: …` error that named neither the package nor the option. Such a glob is now rejected when the options are resolved, with a message that names the option and the glob, the same way `logFilter.include` and `logFilter.exclude` already were: `logixlysia: invalid sampling config — tail.paths: '/a/**/**/x' — Invalid glob pattern: …`. The `tail.paths` globs are checked only when head sampling drops records (a `sampling.head` rate below 100), the only case in which they are compiled, so a config that started before still starts.
