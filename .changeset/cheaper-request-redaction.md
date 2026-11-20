---
'logixlysia': patch
---

Make `autoRedact` cheaper again on the per-request path. Text that cannot hold a secret (a method, a path segment, a request id) skips the secret rules, a host name is no longer run through the IPv4 pattern, and a request URL with a plain query is checked as text instead of parsed. The redacted output is the same. In a local run a request through the `prod` preset took about 12% less time with no query, and between 29% (Node) and 54% (Bun) less with one.
