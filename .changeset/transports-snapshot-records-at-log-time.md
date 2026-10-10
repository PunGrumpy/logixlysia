---
'logixlysia': patch
---

The HTTP adapters now take a JSON-safe copy of each record's `meta` at the moment it is logged. A later change to a logged object is no longer shipped, which also closes a redaction bypass under `autoRedact` (an adapter wrapped by `withRedaction` takes its copy when the wrapper hands the record over, after its own asynchronous redaction, so that window is unchanged). A value that cannot be serialized (a throwing `toJSON` or getter) is replaced by `"[Unserializable]"` for that field only, where it previously turned a whole Axiom, Better Stack or Datadog batch into that string or rejected a ClickHouse, HyperDX, OTLP, PostHog or Sentry batch. A BigInt anywhere in `meta` is shipped as its decimal string by every adapter, so a BigInt user id now resolves to PostHog's `distinct_id`, and `flattenMeta` no longer renders a nested BigInt or cycle as `[object Object]`.
