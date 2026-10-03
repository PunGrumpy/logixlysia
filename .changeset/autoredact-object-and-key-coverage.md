---
'logixlysia': patch
---

`autoRedact` now masks values inside `Headers`, `URL`, `URLSearchParams`, `Map`, and `Set` objects. Before, these passed through unchanged and serialized with their original values. Compound key names such as `newPassword`, `apiSecret`, `aws_secret_access_key`, `authToken`, and `X-CSRF-Token` now count as sensitive. Every value of a repeated query parameter and every percent-encoded path segment is checked.
