---
'logixlysia': patch
---

An adapter endpoint that cannot be parsed and carries `user:password@` without a scheme, such as `//user:password@host/path`, is reported as `<redacted>@host/path`. Before, the credentials were masked only when the value started with a scheme, so the error printed them.
