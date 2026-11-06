---
'logixlysia': minor
---

`mergeContext` and per-line context now merge nested plain objects, so `log.mergeContext({ user: { id } })` followed by `log.mergeContext({ user: { plan } })` keeps both keys. A nested overwrite that relied on replacing the whole object now keeps the old keys; send `null` or an array to replace (a typed field's type has to allow it). Arrays, dates and class instances still replace, and typed fields accept a partial nested object through the new `DeepPartial` type.
