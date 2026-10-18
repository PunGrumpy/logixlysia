---
'logixlysia': patch
---

`autoRedact` no longer takes quadratic time on a long run of `eyJ` in a header, path or value (a 100 KB header cost about a second per log line), and a getter or Proxy trap that throws no longer drops the whole record: only that field becomes `"[Unserializable]"`, as it does without `autoRedact`. A getter defined on an error is now redacted like any other field.
