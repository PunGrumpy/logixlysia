---
'logixlysia': patch
---

The error for an adapter endpoint URL that does not parse printed the URL's query string and fragment, so a key passed as `?api_key=…` reached stderr and any error reporter. The message now shows `?<redacted>` or `#<redacted>` in their place, and only the scheme when an `@` follows that `?` or `#`, since a password may itself contain one. A logged field named `__proto__` was dropped when an adapter flattened a record into attributes, and it is now kept as an ordinary field.
