---
'logixlysia': patch
---

Make `autoRedact` cheaper again on the per-request path. Text that cannot hold a secret (a method, a path segment, a request id) skips the secret rules, a host name is no longer run through the IPv4 pattern, and a request URL with a plain query is checked as text instead of parsed. The redacted output is the same. A request through the `prod` preset takes about a fifth less time with no query and about two fifths less with one.
